const express = require("express");
const router = express.Router();

const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;


const moment = require('moment');
const numberToWords = require('number-to-words');
const mongoose = require("mongoose");


const bcrypt = require("bcrypt");
const saltRounds = 10;

router.use(session({
    secret: "TOP_SECRET",
    resave: false,
    saveUninitialized: true
}));

router.use(passport.initialize());
router.use(passport.session());




const User = require("../model/User");
const Branch = require("../model/Branch");
const StaffLog = require("../model/StaffLog");
const Role = require("../model/Role");
const checkPermission = require("../Utils/checkPermission");






// USER SIGN-UP LOGIC 
router.get("/", (req, res) => {
  res.render("Auth/signin");
});


router.get("/register", async (req, res) => {
  try {
    // Find the "owner" role in the Role collection
    const ownerRole = await Role.findOne({ name: "owner" });

    // If owner role doesn't exist yet, allow registration
    if (!ownerRole) {
      return res.render("Auth/register");
    }

    // Check if a user already has the owner role
    const existingOwner = await User.findOne({ role: ownerRole._id });

    if (existingOwner) {
      // Owner already exists → block further registration
      return res.redirect("/");
    }

    // No owner exists yet → show registration form
    res.render("Auth/register");
  } catch (err) {
    console.error("Error loading register page:", err);
    res.redirect("/error-404");
  }
});


router.get('/logout', (req, res, next) => {
  const staffLogId = req.session.staffLogId;
  if (staffLogId) {
    StaffLog.findByIdAndUpdate(staffLogId, { signOutTime: new Date() })
      .catch(err => console.error('Error logging sign-out time:', err));
  }

  req.logout(err => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.redirect('/');
    });
  });
});


router.get("/users", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  User.findById(req.user._id)
    .populate("branch")
    .populate("role")
    .then(user => {
      if (!user) return res.redirect("/");

      if (user.role && user.role.name === 'owner') {
        Branch.findById(user.branch)
          .then(ownerBranch => {
            Branch.find()
              .then(allBranches => {
                Role.find()
                  .then(allRoles => {
                    User.find({ branch: { $in: allBranches.map(b => b._id) } })
                      .populate("branch")
                      .populate("role")
                      .then(allUsers => {
                        res.render("User/users", {
                          user,
                          ownerBranch: { branch: ownerBranch },
                          branches: allBranches,
                          roles: allRoles,
                          users: allUsers
                        });
                      })
                      .catch(err => {
                        console.error("Error fetching users:", err);
                        res.redirect("/error-404");
                      });
                  });
              })
              .catch(err => {
                console.error(err);
                res.redirect('/error-404');
              });
          })
          .catch(err => {
            console.error(err);
            res.redirect('/error-404');
          });

      } else {
        Role.find()
          .then(allRoles => {
            User.find({ branch: user.branch._id })
              .populate("branch")
              .populate("role")
              .then(branchUsers => {
                res.render("User/users", {
                  user,
                  ownerBranch: { branch: user.branch },
                  branches: [user.branch],
                  roles: allRoles,
                  users: branchUsers
                });
              })
              .catch(err => {
                console.error("Error fetching branch users:", err);
                res.redirect("/error-404");
              });
          });
      }
    })
    .catch(err => {
      console.error(err);
      res.redirect("/error-404");
    });
});

router.post("/create-user", async (req, res, next) => {
  const { fullname, username, password, role, branch } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render("User/users", {
        error: "Username already exists.",
      });
    }

    const assignedRole = await Role.findById(role);
    if (!assignedRole) {
      return res.status(400).send("Invalid role selected.");
    }

    const assignedBranch = await Branch.findById(branch);
    if (!assignedBranch) {
      return res.status(400).send("Invalid branch selected.");
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const newUser = await User.create({
      fullname,
      username,
      password: hashedPassword,
      role: assignedRole._id,
      branch: assignedBranch._id
    });

    await Branch.findByIdAndUpdate(branch, {
      $addToSet: { assignedUsers: newUser._id }
    });

    res.redirect("/users");

  } catch (err) {
    console.error("Error creating user:", err);
    next(err);
  }
});


router.get("/user-profile", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    // Populate both branch and role
    const user = await User.findById(req.user._id)
      .populate("branch")
      .populate("role");

    if (!user) return res.redirect("/");

    const branchId = user.branch?._id || user.branch;

    const [ownerBranch, allBranches] =
      user.role.name === "owner"
        ? await Promise.all([
            Branch.findById(branchId),
            Branch.find()
          ])
        : [user.branch, []]; // Avoid null for branches

    res.render("Auth/profile", {
      user,
      ownerBranch: { branch: ownerBranch },
      branches: allBranches
    });

  } catch (err) {
    console.error("Error in /user-profile route:", err);
    res.redirect("/error-404");
  }
});


router.get("/user/:id", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  try {
    // Populate both branch and role so we have role.name available
    const targetUser = await User.findById(req.params.id)
      .populate("branch")
      .populate("role");

    if (!targetUser) return res.redirect("/");

    // Only allow owner/admin roles to view others
    if (
      String(req.user._id) !== String(targetUser._id) &&
      req.user.role.name !== "owner"
    ) {
      return res.redirect("/error-404");
    }

    const branchId = targetUser.branch?._id || targetUser.branch;

    const [ownerBranch, allBranches] =
      req.user.role.name === "owner"
        ? await Promise.all([
            Branch.findById(branchId),
            Branch.find()
          ])
        : [targetUser.branch, []]; // empty array instead of null to avoid EJS error

    res.render("Auth/user-profile", {
      user: targetUser,
      ownerBranch: { branch: ownerBranch },
      branches: allBranches
    });

  } catch (err) {
    console.error("Error in /users/:id route:", err);
    res.redirect("/error-404");
  }
});


router.post("/update-profile", async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect("/");

  const { fullname, username, currentPassword, newPassword } = req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.redirect("/");

    // Update basic fields
    user.fullname = fullname;
    user.username = username;

    // Handle password update only if provided
    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        // Optional: flash message or query param
        return res.redirect("/user-profile?error=invalid-password");
      }

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(newPassword, salt);
      user.password = hashed;
    }

    await user.save();

    // Optional: flash message or query param
    res.redirect("/dashboard");

  } catch (err) {
    console.error("Error updating profile:", err);
    res.redirect("/error-404");
  }
});

router.post("/register", async (req, res, next) => {
  const { fullname, username, password, branch_name, branch_address, branch_phone } = req.body;

  try {
    let ownerRole = await Role.findOne({ name: "owner" });
    if (!ownerRole) {
      ownerRole = await Role.create({
        name: "owner",
        permissions: ["manage_all"]
      });
    }

    const existingOwner = await User.findOne({ role: ownerRole._id });
    if (existingOwner) {
      return res.redirect("/");
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render("Auth/auth-login", {
        error: "Username already exists. Please login."
      });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await User.create({
      fullname,
      username,
      password: hashedPassword,
      role: ownerRole._id
    });

    const newBranch = await Branch.create({
      branch_name,
      branch_address,
      branch_phone,
      createdBy: newUser._id,
      isHeadOffice: true,
      assignedUsers: [newUser._id]
    });

    newUser.branch = newBranch._id;
    await newUser.save();

    res.redirect("/");

  } catch (err) {
    console.error("Error in /register route:", err);
    next(err);
  }
});




const checkAndCreateNotifications = require('../Utils/checkAndCreateNotifications'); // ✅ Import

router.post("/sign-in", function (req, res, next) {
  passport.authenticate("local", function (err, user, info) {
    if (err) return next(err);

    if (!user) {
      if (info.message === "User not found") {
        return res.redirect("/register");
      } else if (info.message === "Incorrect password") {
        return res.redirect("/?error=Incorrect%20password");
      } else {
        return res.redirect("/?error=Authentication%20failed");
      }
    }

    req.logIn(user, async function (err) {
      if (err) return next(err);

      try {
        // ✅ Generate notifications for the logged-in user
        const populatedUser = await User.findById(user._id).populate("branch");
        await checkAndCreateNotifications(populatedUser);

        // ✅ Log staff activity
        const log = await StaffLog.create({
          user: user._id,
          role: user.role,
          signInTime: new Date()
        });

        req.session.staffLogId = log._id;
        return res.redirect("/dashboard");
      } catch (err) {
        console.error("Login flow error:", err);
        return res.redirect("/dashboard"); // still proceed
      }
    });
  })(req, res, next);
});


router.get(
  "/staffLogs",
  checkPermission("staff-logs"),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id)
        .populate("branch")
        .populate("role");

      if (!user || user.role?.name !== "owner") {
        return res.status(403).send("Access denied");
      }

      // Use user's branch id if no branch query param is specified
      const branchId = req.query.branch || (user.branch?._id || user.branch);

      // Base query without branch filter
      let logsQuery = StaffLog.find()
        .populate({
          path: "user",
          select: "fullname username role branch",
          populate: { path: "role", select: "name" }
        })
        .sort({ signInTime: -1 });

      // Apply branch filter if specified
      if (branchId && branchId !== "") {
        logsQuery = logsQuery.where("user.branch").equals(branchId);
      }

      const logs = await logsQuery.exec();

      // Fetch all branches for dropdown/filter
      const branches = await Branch.find().exec();

      // Fetch ownerBranch details for header partial
      const ownerBranch = await Branch.findById(branchId);

      res.render("User/user-logs", {
        user,
        logs,
        branches,
        selectedBranch: branchId,
        ownerBranch: { branch: ownerBranch }
      });
    } catch (err) {
      next(err);
    }
  }
);



passport.use(new LocalStrategy(function verify(username, password, done) {
    User.findOne({ username: username }).then(function (foundUser) {
        if (!foundUser) {
            return done(null, false, { message: "User not found" });
        }

        bcrypt.compare(password, foundUser.password, function (err, result) {
            if (err) return done(err);
            if (result) {
                return done(null, foundUser);
            } else {
                return done(null, false, { message: "Incorrect password" });
            }
        });
    }).catch(err => done(err));
}));

passport.serializeUser((user, done) =>{
    done(null, user);
})

passport.deserializeUser(async (user, done) => {
  try {
    const fullUser = await User.findById(user._id).populate('role');
    done(null, fullUser);
  } catch (err) {
    done(err);
  }
});



module.exports = router;
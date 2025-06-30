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






// USER SIGN-UP LOGIC 
router.get("/", (req, res) => {
  res.render("Auth/signin");
});


router.get("/register", (req,res)=>{
  res.render("Auth/register")
})




router.post("/register", (req, res, next) => {
  const { fullname, username, password, role, branch_name, branch_address, branch_phone } = req.body;

  User.findOne({ username: username })
    .then(existingUser => {
      if (existingUser) {
        return res.render("Auth/auth-login", {
          error: "Username already exists. Please login.",
          existingUser
        });
      }

      bcrypt.hash(password, saltRounds)
        .then(hashedPassword => {
          const newUser = new User({
            fullname,
            username,
            password: hashedPassword,
            role: role || 'staff'
          });

          newUser.save()
            .then(savedUser => {
              if (role === 'owner') {
                Branch.findOne({ isHeadOffice: true })
                  .then(existingHeadOffice => {
                    const isHeadOffice = !existingHeadOffice;

                    const newBranch = new Branch({
                      branch_name,
                      branch_address,
                      branch_phone,
                      createdBy: savedUser._id,
                      isHeadOffice,
                      assignedUsers: [savedUser._id]
                    });

                    newBranch.save()
                      .then(savedBranch => {
                        savedUser.branch = savedBranch._id;
                        savedUser.save()
                          .then(() => res.redirect("/"))
                          .catch(err => {
                            console.error("Error saving user with branch ref:", err);
                            next(err);
                          });
                      })
                      .catch(err => {
                        console.error("Error creating branch:", err);
                        next(err);
                      });
                  })
                  .catch(err => {
                    console.error("Error checking head office:", err);
                    next(err);
                  });
              } else {
                const newBranch = new Branch({
                  branch_name,
                  branch_address,
                  branch_phone,
                  createdBy: savedUser._id,
                  assignedUsers: [savedUser._id]
                });

                newBranch.save()
                  .then(savedBranch => {
                    savedUser.branch = savedBranch._id;
                    savedUser.save()
                      .then(() => res.redirect("/"))
                      .catch(err => {
                        console.error("Error saving user with branch ref:", err);
                        next(err);
                      });
                  })
                  .catch(err => {
                    console.error("Error creating branch:", err);
                    next(err);
                  });
              }
            })
            .catch(err => {
              console.error("Error saving user:", err);
              next(err);
            });
        })
        .catch(err => {
          console.error("Error hashing password:", err);
          next(err);
        });
    })
    .catch(err => {
      console.error("Error checking existing user:", err);
      next(err);
    });
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

passport.deserializeUser((user, done) =>{
    done(null, user);
})


module.exports = router;
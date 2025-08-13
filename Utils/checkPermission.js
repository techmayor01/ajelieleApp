const mongoose = require("mongoose");
const User = require("../model/User");
const Role = require("../model/Role");  
const Branch = require("../model/Branch");

module.exports = function checkPermission(permission) {
  return async (req, res, next) => {
    if (!req.isAuthenticated()) return res.redirect("/");

    try {
      const user = await User.findById(req.user._id)
        .populate("role")
        .populate("branch")
        .exec();

      if (!user) return res.redirect("/");

      req.user = user;

      // If the user is owner, attach all branches to req
      if (user.role?.name.toLowerCase() === "owner") {
        const allBranches = await Branch.find();
        req.allBranches = allBranches; // add branches to request
        req.selectedBranchId = req.query.branchId || user.branch?._id;
        return next();
      }

      // Check permission for non-owners
      if (!user.role?.permissions?.includes(permission)) {
        return res.status(403).render("Auth/error-page", { user });
      }

      next();
    } catch (err) {
      console.error("Error in permission check middleware:", err);
      res.redirect("/error-404");
    }
  };
};
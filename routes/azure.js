const bcrypt = require("bcrypt");
const crypto = require("crypto");
const debug = require("debug")("discord-user-manager:azure");
const express = require("express");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const router = express.Router();
const AzureStrategy = require("passport-azure-ad-oauth2").Strategy;

const models = require("../models");

// Google strategy for autenticating users with a Google account
passport.use(
  new AzureStrategy(
    {
      clientID: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      callbackURL: process.env.AZURE_REDIRECT_URI,
    },
    (accessToken, refreshToken, params, _profile, done) => {
      const profile = jwt.decode(params.id_token);
      const email = profile.upn || profile.unique_name;

      // Get the email address of the user:
      if (!email) {
        return done("No email address associated with Microsoft account.");
      }

      // Extract the first name and last name from the user profile.
      // Not sure how to handle cultures that swap first/last names..
      const displayName = `${profile.given_name} ${profile.family_name}`;

      models.User.findOrCreate({
        where: {
          username: email,
        },
      })
        .then(([user, created]) => {
          if (created) {
            debug(`New user added to database: ${displayName}`);
          } else {
            debug(`User already registered to database: ${displayName}`);
          }

          user
            .update({
              // Azure users get a random password.
              password: user.password || bcrypt.hashSync(crypto.randomBytes(50).toString("base64"), 10),
              azureId: profile.oid,
              name: displayName,
            })
            .then(() => {
              done(null, user);
            });
        })
        .catch((err) => {
          debug(`An error occured when adding user: ${err}`);
          done(err);
        });
    }
  )
);
/* GET Google Login page. */
router.get("/", passport.authenticate("azure_ad_oauth2"));

/* Google login redirect URI */
router.get(
  "/callback",
  passport.authenticate("azure_ad_oauth2", {
    failureRedirect: "/azure",
  }),
  (req, res) => {
    debug("Microsoft user successfully logged in.");
    // Authentication successful, redirect home.
    res.redirect("/");
  }
);

module.exports = router;

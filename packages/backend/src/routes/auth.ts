import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import knex, { insertRow } from "../db/knex";
import { requireAuth } from "../middleware/auth";

const router = Router();

/** ADMIN_EMAILS, comma separated, compared case-insensitively. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_accessToken, _refreshToken, profile: Profile, done) => {
      try {
        const googleId = profile.id;
        const googleEmail = profile.emails?.[0];
        const email = (googleEmail?.value ?? "").trim().toLowerCase();
        const name = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value ?? null;
        const isAdminEmail = adminEmails().includes(email);

        // Returning user: already linked to this Google account.
        const [linked] = await knex("users").where({ google_id: googleId });
        if (linked) {
          done(null, linked);
          return;
        }

        // Everything below matches on email, so only an address Google has
        // verified may claim an account; otherwise anyone could register a
        // Google account under someone else's address and take their files.
        if (!email || googleEmail?.verified === false) {
          done(null, false);
          return;
        }

        // Added by an admin and signing in for the first time: link this
        // Google account, and the documents uploaded for them come with it.
        const [invited] = await knex("users").where({ email }).whereNull("google_id");
        if (invited) {
          await knex("users").where({ id: invited.id }).update({
            google_id: googleId,
            name: name || invited.name,
            avatar_url: avatarUrl,
            is_admin: invited.is_admin || isAdminEmail,
          });
          done(null, await knex("users").where({ id: invited.id }).first());
          return;
        }

        // Sign-in is by invitation only. Admin emails are the exception, so
        // a fresh install always has someone who can add the others.
        if (!isAdminEmail) {
          done(null, false);
          return;
        }
        const user = await insertRow<Express.User>("users", {
          google_id: googleId,
          email,
          name,
          avatar_url: avatarUrl,
          is_admin: true,
        });
        done(null, user);
      } catch (err) {
        done(err as Error);
      }
    },
  ),
);

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    // The only refusal is an email no admin has added (or an unverified one).
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=not_invited`,
  }),
  (req: Request, res: Response) => {
    const user = req.user as { id: string; email: string; is_admin: boolean };
    const token = jwt.sign(
      { id: user.id, email: user.email, is_admin: user.is_admin },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" },
    );
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${process.env.FRONTEND_URL}/chat`);
  },
);

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const [user] = await knex("users")
    .where({ id: req.user!.id })
    .select("id", "email", "name", "avatar_url", "is_admin");
  res.json(user);
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export default router;

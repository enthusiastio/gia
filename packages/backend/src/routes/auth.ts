import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import jwt from "jsonwebtoken";
import knex from "../db/knex";
import { requireAuth } from "../middleware/auth";

const router = Router();

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
        const email = profile.emails?.[0]?.value ?? "";
        const name = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value ?? null;

        let [user] = await knex("users").where({ google_id: googleId });

        const adminEmails = process.env.ADMIN_EMAILS?.split(",") ?? [];

        const is_admin = adminEmails.includes(email);
        if (!user) {
          [user] = await knex("users")
            .insert({
              google_id: googleId,
              email,
              name,
              avatar_url: avatarUrl,
              is_admin,
            })
            .returning("*");
        }

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
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=1`,
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

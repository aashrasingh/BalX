import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL || "",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "balx_dev_secret_change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "24h",
  demoOtp: process.env.DEMO_OTP || "123456",
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || "5", 10),
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export const isDemoMode = !config.databaseUrl;
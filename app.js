import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import cookieParser from "cookie-parser";

import errorHandler from "./utils/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import bookRoutes from "./routes/bookRoutes.js";
import borrowRoutes from "./routes/borrowRoutes.js";

const app = express();

// Trust proxy for rate limiting behind reverse proxies
app.set("trust proxy", 1);

// CORS configuration
app.use(
	cors({
		origin: process.env.FRONTEND_URL || "http://localhost:3000",
		credentials: true,
	})
);

// Security headers
app.use(helmet());

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
	max: 100,
	windowMs: 60 * 60 * 1000,
	message: "Too many requests from this IP, please try again in an hour",
	standardHeaders: true,
	legacyHeaders: false,
});

app.use("/api", limiter);

// Prevent parameter pollution
app.use(
	hpp({
		whitelist: ["name", "email", "title", "author", "shelfLocation", "borrowedAt", "dueAt", "status"],
	})
);

// Global error handlers
app.use((err, req, res, next) => {
	// Handle JSON parsing errors
	if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
		return res.status(400).json({
			success: false,
			message: "Invalid JSON format",
		});
	}

	// Handle payload too large errors
	if (err.type === "entity.too.large") {
		return res.status(413).json({
			success: false,
			message: "Request entity too large",
		});
	}

	next(err);
});

// Health check endpoint
app.get("/api/v1/health", (req, res) => {
	res.status(200).json({
		success: true,
		message: "Server is healthy",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		environment: process.env.NODE_ENV,
	});
});

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/books", bookRoutes);
app.use("/api/v1/borrows", borrowRoutes);

// Handle 404 for undefined routes
app.use((req, res, next) => {
	res.status(404).json({
		success: false,
		message: `Can't find ${req.originalUrl} on this server!`,
	});
});

// Global error handling middleware
app.use(errorHandler);

export default app;

import prisma from "../prisma/client.js";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { promisify } from "util";

import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

const signToken = (id) => {
	return jwt.sign({ id }, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRES_IN || "90d",
	});
};

const createSendToken = (user, statusCode, res) => {
	const token = signToken(user.id);

	const cookieOptions = {
		expires: new Date(Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN || 90) * 24 * 60 * 60 * 1000),
		httpOnly: true,
	};

	if (process.env.NODE_ENV === "production") cookieOptions.secure = true;

	res.cookie("jwt", token, cookieOptions);

	user.password = undefined;

	res.status(statusCode).json({
		success: true,
		token,
		data: {
			user,
		},
	});
};

// Login
export const login = catchAsync(async (req, res, next) => {
	const { email, password } = req.body;

	if (!email || !password) {
		return next(new AppError("Please provide email and password!", 400));
	}

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		return next(new AppError("Incorrect email or password", 401));
	}

	if (!(await bcrypt.compare(password, user.password))) {
		return next(new AppError("Incorrect email or password", 401));
	}

	createSendToken(user, 200, res);
});

// Register
export const signup = catchAsync(async (req, res, next) => {
	const { email, password, name } = req.body;

	if (!email || !password || !name) {
		return next(new AppError("Please provide email, password, and name!", 400));
	}

	const existingUser = await prisma.user.findUnique({
		where: { email },
	});
	if (existingUser) {
		return next(new AppError("User already exists", 400));
	}

	const hashedPassword = await bcrypt.hash(password, 12);

	const newUser = await prisma.user.create({
		data: {
			email,
			password: hashedPassword,
			name,
		},
	});

	createSendToken(newUser, 201, res);
});

// Check if the user is logged in
export const protect = catchAsync(async (req, res, next) => {
	let token;
	if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
		token = req.headers.authorization.split(" ")[1];
	} else if (req.cookies.jwt) {
		token = req.cookies.jwt;
	}

	if (!token) {
		return next(new AppError("You are not logged in! Please log in to get access.", 401));
	}

	const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

	const currentUser = await prisma.user.findUnique({
		where: { id: decoded.id },
	});
	if (!currentUser) {
		return next(new AppError("The user belonging to this token does no longer exist.", 401));
	}

	req.user = currentUser;
	next();
});

// Restrict access to APIs
export const restrictTo = (...roles) => {
	return (req, res, next) => {
		if (!roles.includes(req.user.role)) {
			return next(new AppError("You do not have permission to perform this action", 403));
		}

		next();
	};
};

// Logout
export const logout = (req, res) => {
	res.cookie("jwt", "logged out", {
		expires: new Date(Date.now() + 10 * 1000),
		httpOnly: true,
	});
	res.status(200).json({ success: true });
};

import { validationResult } from "express-validator";
import AppError from "./appError.js";

export const handleValidationErrors = (req, res, next) => {
	const errors = validationResult(req);

	if (!errors.isEmpty()) {
		const errorMessages = errors.array().map((error) => error.msg);
		return next(new AppError(`Validation error: ${errorMessages.join(". ")}`, 400));
	}

	next();
};

export const sanitizeInput = (input) => {
	if (typeof input !== "string") return input;

	// Basic XSS prevention - remove potentially dangerous characters
	return input
		.replace(/[<>]/g, "") // Remove < and >
		.trim(); // Remove leading/trailing whitespace
};

export const validateEmail = (email) => {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
};

export const validatePassword = (password) => {
	// At least 8 characters, containing letters and numbers
	const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
	return passwordRegex.test(password);
};

export default {
	handleValidationErrors,
	sanitizeInput,
	validateEmail,
	validatePassword,
};

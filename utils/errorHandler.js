import AppError from "./appError.js";

// Handle Prisma Database Errors
const handlePrismaClientKnownRequestError = (err) => {
	switch (err.code) {
		case "P2002":
			// Unique constraint violation
			const field = err.meta?.target?.[0] || "field";
			return new AppError(`Duplicate ${field}. Please use another value!`, 400);

		case "P2014":
			// Foreign key constraint violation
			return new AppError("Invalid relation. Referenced record does not exist.", 400);

		case "P2003":
			// Foreign key constraint failed
			return new AppError("Cannot delete record. It is referenced by other records.", 400);

		case "P2025":
			// Record not found
			return new AppError("Record not found.", 404);

		case "P2000":
			// Value too long for field
			return new AppError("Input value is too long for the field.", 400);

		case "P2006":
			// Invalid value for field
			return new AppError("Invalid value provided for the field.", 400);

		default:
			return new AppError("Database operation failed.", 500);
	}
};

const handlePrismaClientValidationError = (err) => {
	return new AppError("Invalid input data provided.", 400);
};

const handleJWTError = () => {
	return new AppError("Invalid token. Please log in again!", 401);
};

const handleJWTExpiredError = () => {
	return new AppError("Your token has expired! Please log in again!", 401);
};

const sendErrorDev = (err, res) => {
	res.status(err.statusCode || 500).json({
		success: false,
		status: err.status,
		error: err,
		message: err.message,
		stack: err.stack,
	});
};

const sendErrorProd = (err, res) => {
	if (err.isOperational) {
		res.status(err.statusCode).json({
			success: false,
			status: err.status,
			message: err.message,
		});
	} else {
		// Programming or other unknown error: don't leak error details
		console.error("ERROR 💥", err);
		res.status(500).json({
			success: false,
			status: "error",
			message: "Something went wrong!",
		});
	}
};

const errorHandler = (err, req, res, next) => {
	err.statusCode = err.statusCode || 500;
	err.status = err.status || "error";

	if (process.env.NODE_ENV === "development") {
		sendErrorDev(err, res);
	} else {
		let error = Object.create(err);
		error.message = err.message;

		// Handle specific Prisma errors
		if (err.name === "PrismaClientKnownRequestError") {
			error = handlePrismaClientKnownRequestError(err);
		}
		if (err.name === "PrismaClientValidationError") {
			error = handlePrismaClientValidationError(err);
		}
		if (err.name === "JsonWebTokenError") {
			error = handleJWTError();
		}
		if (err.name === "TokenExpiredError") {
			error = handleJWTExpiredError();
		}

		sendErrorProd(error, res);
	}
};

export default errorHandler;

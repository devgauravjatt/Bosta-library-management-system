import prisma from "../prisma/client.js";

import bcrypt from "bcrypt";

import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

// Get all users by admin only
export const getAllUsers = catchAsync(async (req, res, next) => {
	const users = await prisma.user.findMany({
		select: {
			name: true,
			email: true,
			createdAt: true,
			updatedAt: true,
		},
	});
	res.status(200).json({
		success: true,
		data: {
			users,
		},
	});
});

// create a new user by admin only
export const createUser = catchAsync(async (req, res, next) => {
	const { name, email, password } = req.body;

	if (!name || !email || !password) {
		return next(new AppError("All fields are required: name, email, password", 400));
	}

	const existingUser = await prisma.user.findUnique({
		where: { email },
	});

	if (existingUser) {
		return next(new AppError("User with this email already exists", 400));
	}

	const hashedPassword = await bcrypt.hash(password, 12);

	const newUser = await prisma.user.create({
		data: {
			name,
			email,
			password: hashedPassword,
		},
	});

	res.status(201).json({
		success: true,
		data: {
			user: {
				name: newUser.name,
				email: newUser.email,
				createdAt: newUser.createdAt,
				updatedAt: newUser.updatedAt,
			},
		},
	});
});

// Update a user by admin only
export const updateUser = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const { name, email, password } = req.body;

	const existingUser = await prisma.user.findUnique({
		where: { id: Number(id) },
	});

	if (!existingUser) {
		return next(new AppError("User not found", 404));
	}

	const updateData = {};
	if (name) updateData.name = name;
	if (email) updateData.email = email;
	if (password) updateData.password = await bcrypt.hash(password, 12);

	const updatedUser = await prisma.user.update({
		where: { id: Number(id) },
		data: updateData,
	});

	res.status(200).json({
		success: true,
		data: {
			user: {
				name: updatedUser.name,
				email: updatedUser.email,
				createdAt: updatedUser.createdAt,
				updatedAt: updatedUser.updatedAt,
			},
		},
	});
});

// delete a user by admin only
export const deleteUser = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const existingUser = await prisma.user.findUnique({
		where: { id: Number(id) },
	});

	if (!existingUser) {
		return next(new AppError("User not found", 404));
	}

	await prisma.user.delete({
		where: { id: Number(id) },
	});

	res.status(204).json({
		success: true,
		data: null,
	});
});

// Get a user by ID by admin only
export const getUserById = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const user = await prisma.user.findUnique({
		where: { id: Number(id) },
		select: {
			name: true,
			email: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	if (!user) {
		return next(new AppError("User not found", 404));
	}

	res.status(200).json({
		success: true,
		data: {
			user,
		},
	});
});

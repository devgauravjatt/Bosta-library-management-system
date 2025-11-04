import XLSX from "xlsx";
import { Parser } from "json2csv";

import prisma from "../prisma/client.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

// list and search for borrows history
export const getAllBorrows = catchAsync(async (req, res, next) => {
	const { userId, bookId, status, overdue, sortByOverdue } = req.query;

	const isAdmin = req.user.role === "ADMIN";
	const now = new Date();

	// If the user is not an admin, only show his own borrows history
	let borrows = await prisma.borrow.findMany({
		where: {
			...(isAdmin ? {} : { userId: req.user.id }),
			...(userId && { userId: Number(userId) }),
			...(bookId && { bookId: Number(bookId) }),
			...(status && { status }), // Filter by status
			...(overdue === "true" && {
				// filter by overdue
				dueAt: { lt: now },
				returnedAt: null,
			}),
		},
		include: {
			user: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			book: {
				select: {
					id: true,
					title: true,
					author: true,
					isbn: true,
				},
			},
		},
	});

	if (sortByOverdue) {
		borrows = borrows.map((borrow) => ({
			...borrow,
			overdueDays: Math.floor((now - borrow.dueAt) / (1000 * 60 * 60 * 24)),
		}));

		// Sort descending: most overdue first
		borrows.sort((a, b) => b.overdueDays - a.overdueDays);
	}

	res.status(200).json({
		success: true,
		data: {
			borrows,
		},
	});
});

// Create a borrow request for the user so the admin can accept or reject it
export const createBorrow = catchAsync(async (req, res, next) => {
	const { bookId, dueAt } = req.body;

	if (!bookId || !dueAt) {
		return next(new AppError("Book ID and due date are required", 400));
	}

	// Validate dueAt is a valid date
	const dueDateObj = new Date(dueAt);
	if (isNaN(dueDateObj.getTime())) {
		return next(new AppError("Invalid due date format", 400));
	}

	const book = await prisma.book.findUnique({
		where: { id: Number(bookId) },
	});

	if (!book) {
		return next(new AppError("Book not found", 404));
	}

	if (!book.isActive) {
		return next(new AppError("Book is not active", 400));
	}

	const existingBorrow = await prisma.borrow.findFirst({
		where: {
			userId: req.user.id,
			bookId: Number(bookId),
			status: {
				in: ["PENDING", "APPROVED"],
			},
		},
	});

	if (existingBorrow) {
		return next(new AppError("You already have this book borrowed or pending", 400));
	}

	const newBorrow = await prisma.borrow.create({
		data: {
			userId: req.user.id,
			bookId: Number(bookId),
			dueAt: dueDateObj,
		},
	});

	res.status(201).json({
		success: true,
		data: {
			borrow: newBorrow,
		},
	});
});

// Get a borrow by ID
export const getBorrowById = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const borrow = await prisma.borrow.findUnique({
		where: { id: Number(id) },
		include: {
			user: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			book: {
				select: {
					id: true,
					title: true,
					author: true,
					isbn: true,
				},
			},
		},
	});

	if (!borrow) {
		return next(new AppError("Borrow not found", 404));
	}

	// Check if user can access this borrow
	if (req.user.role !== "ADMIN" && borrow.userId !== req.user.id) {
		return next(new AppError("You can only access your own borrows", 403));
	}

	res.status(200).json({
		success: true,
		data: {
			borrow,
		},
	});
});

// Admin updates the borrow so he can approve a borrow request or reject it or return a book for the user
// User updates the bookId while borrow is still PENDING
export const updateBorrow = catchAsync(async (req, res, next) => {
	const { id } = req.params;
	const { bookId, status } = req.body;

	const existingBorrow = await prisma.borrow.findUnique({
		where: { id: Number(id) },
		include: { book: true },
	});

	if (!existingBorrow) {
		return next(new AppError("Borrow not found", 404));
	}

	// Borrower case
	if (req.user.role !== "ADMIN") {
		if (existingBorrow.userId !== req.user.id) {
			return next(new AppError("You can only update your own borrows", 403));
		}

		if (existingBorrow.status !== "PENDING") {
			return next(new AppError("You can only update bookId while borrow is still PENDING", 400));
		}

		if (!bookId) {
			return next(new AppError("Book ID is required to update", 400));
		}

		// Check if the new book exists and is active
		const newBook = await prisma.book.findUnique({
			where: { id: Number(bookId) },
		});

		if (!newBook) {
			return next(new AppError("Book not found", 404));
		}

		if (!newBook.isActive) {
			return next(new AppError("Book is not active", 400));
		}

		const updatedBorrow = await prisma.borrow.update({
			where: { id: Number(id) },
			data: { bookId: Number(bookId) },
		});

		return res.status(200).json({
			success: true,
			data: { borrow: updatedBorrow },
		});
	}

	// Admin case
	if (!status) {
		return next(new AppError("Status is required for admin updates", 400));
	}

	// Validate status transitions
	const validStatuses = ["PENDING", "APPROVED", "REJECTED", "RETURNED"];
	if (!validStatuses.includes(status)) {
		return next(new AppError("Invalid status provided", 400));
	}

	// Validate status transitions - only allow specific transitions
	const currentStatus = existingBorrow.status;
	const validTransitions = {
		PENDING: ["APPROVED", "REJECTED"],
		APPROVED: ["RETURNED"],
		REJECTED: [], // No transitions allowed from REJECTED
		RETURNED: [], // No transitions allowed from RETURNED
	};

	if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(status)) {
		return next(new AppError(`Cannot change status from ${currentStatus} to ${status}`, 400));
	}

	// Use transaction for book availability updates
	const result = await prisma.$transaction(async (tx) => {
		const updateData = { status };

		if (status === "APPROVED") {
			// Check if book is available when approving
			if (existingBorrow.book.availableQuantity <= 0) {
				throw new AppError("Book is no longer available", 400);
			}

			updateData.approvedAt = new Date();

			// Decrease available quantity
			await tx.book.update({
				where: { id: existingBorrow.bookId },
				data: { availableQuantity: { decrement: 1 } },
			});
		}

		if (status === "RETURNED" && currentStatus === "APPROVED") {
			updateData.returnedAt = new Date();

			// Increase available quantity
			await tx.book.update({
				where: { id: existingBorrow.bookId },
				data: { availableQuantity: { increment: 1 } },
			});
		}

		const updatedBorrow = await tx.borrow.update({
			where: { id: Number(id) },
			data: updateData,
		});

		return updatedBorrow;
	});

	res.status(200).json({
		success: true,
		data: { borrow: result },
	});
});

// Delete a borrow by the admin
// User can only delete a borrow if it's still pending
export const deleteBorrow = catchAsync(async (req, res, next) => {
	const { id } = req.params;

	const existingBorrow = await prisma.borrow.findUnique({
		where: { id: Number(id) },
	});

	if (!existingBorrow) {
		return next(new AppError("Borrow not found", 404));
	}

	if (req.user.role !== "ADMIN" && existingBorrow.userId !== req.user.id) {
		return next(new AppError("You can only delete your own borrows", 403));
	}

	// Users can only delete borrows that are still pending
	if (req.user.role !== "ADMIN" && existingBorrow.status !== "PENDING") {
		return next(new AppError("You can only delete borrows that are still pending", 400));
	}

	// Use transaction to handle book availability if admin deletes an approved borrow
	await prisma.$transaction(async (tx) => {
		// If admin is deleting an approved borrow, increment book availability
		if (req.user.role === "ADMIN" && existingBorrow.status === "APPROVED") {
			await tx.book.update({
				where: { id: existingBorrow.bookId },
				data: { availableQuantity: { increment: 1 } },
			});
		}

		await tx.borrow.delete({
			where: { id: Number(id) },
		});
	});

	res.status(204).json({
		success: true,
		data: null,
	});
});

// Generate analytical reports of borrowing process in a specific period
export const getBorrowReports = catchAsync(async (req, res, next) => {
	const { startDate, endDate, format = "json", userId, bookId, status } = req.query;

	if (!startDate || !endDate) {
		return next(new AppError("Start date and end date are required", 400));
	}

	const start = new Date(startDate);
	const end = new Date(endDate);

	// Validate dates
	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		return next(new AppError("Invalid date format provided", 400));
	}

	if (start >= end) {
		return next(new AppError("Start date must be before end date", 400));
	}

	// Get borrowing data for the specified period
	const borrowsData = await prisma.borrow.findMany({
		where: {
			borrowedAt: {
				gte: start,
				lte: end,
			},
			...(userId && { userId: Number(userId) }),
			...(bookId && { bookId: Number(bookId) }),
			...(status && { status }),
		},
		include: {
			user: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			book: {
				select: {
					id: true,
					title: true,
					author: true,
					isbn: true,
					shelfLocation: true,
				},
			},
		},
		orderBy: {
			borrowedAt: "desc",
		},
	});

	// Calculate analytics
	const totalBorrows = borrowsData.length;
	const statusCounts = borrowsData.reduce((acc, borrow) => {
		acc[borrow.status] = (acc[borrow.status] || 0) + 1;
		return acc;
	}, {});

	const now = new Date();
	const overdueBorrows = borrowsData.filter(
		(borrow) => borrow.status === "APPROVED" && borrow.dueAt < now && !borrow.returnedAt
	);

	const topBorrowedBooks = borrowsData.reduce((acc, borrow) => {
		const bookId = borrow.book.id;
		if (!acc[bookId]) {
			acc[bookId] = {
				book: borrow.book,
				count: 0,
			};
		}
		acc[bookId].count++;
		return acc;
	}, {});

	const topBooksArray = Object.values(topBorrowedBooks)
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	const mostActiveBorrowers = borrowsData.reduce((acc, borrow) => {
		const userId = borrow.user.id;
		if (!acc[userId]) {
			acc[userId] = {
				user: borrow.user,
				count: 0,
			};
		}
		acc[userId].count++;
		return acc;
	}, {});

	const activeBorrowersArray = Object.values(mostActiveBorrowers)
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	const analytics = {
		period: {
			startDate: start.toISOString().split("T")[0],
			endDate: end.toISOString().split("T")[0],
		},
		summary: {
			totalBorrows,
			statusBreakdown: statusCounts,
			overdueBorrows: overdueBorrows.length,
			returnedBorrows: statusCounts.RETURNED || 0,
			pendingBorrows: statusCounts.PENDING || 0,
			approvedBorrows: statusCounts.APPROVED || 0,
			rejectedBorrows: statusCounts.REJECTED || 0,
		},
		topBorrowedBooks: topBooksArray,
		mostActiveBorrowers: activeBorrowersArray,
		detailedBorrows: borrowsData.map((borrow) => ({
			id: borrow.id,
			borrowedAt: borrow.borrowedAt,
			dueAt: borrow.dueAt,
			returnedAt: borrow.returnedAt,
			approvedAt: borrow.approvedAt,
			status: borrow.status,
			overdueDays:
				borrow.status === "APPROVED" && borrow.dueAt < now && !borrow.returnedAt
					? Math.floor((now - borrow.dueAt) / (1000 * 60 * 60 * 24))
					: null,
			user: borrow.user,
			book: borrow.book,
		})),
	};

	// Handle different export formats
	if (format === "csv") {
		const fields = [
			"id",
			"borrowedAt",
			"dueAt",
			"returnedAt",
			"approvedAt",
			"status",
			"overdueDays",
			"user.name",
			"user.email",
			"book.title",
			"book.author",
			"book.isbn",
			"book.shelfLocation",
		];

		const parser = new Parser({ fields });
		const csv = parser.parse(analytics.detailedBorrows);

		res.setHeader("Content-Type", "text/csv");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=borrow-report-${start.toISOString().split("T")[0]}-to-${end.toISOString().split("T")[0]}.csv`
		);
		return res.send(csv);
	}

	if (format === "xlsx") {
		const workbook = XLSX.utils.book_new();

		// Summary sheet
		const summaryData = [
			["Borrowing Report Summary"],
			["Period", `${analytics.period.startDate} to ${analytics.period.endDate}`],
			[""],
			["Total Borrows", analytics.summary.totalBorrows],
			["Pending Borrows", analytics.summary.pendingBorrows],
			["Approved Borrows", analytics.summary.approvedBorrows],
			["Returned Borrows", analytics.summary.returnedBorrows],
			["Rejected Borrows", analytics.summary.rejectedBorrows],
			["Overdue Borrows", analytics.summary.overdueBorrows],
		];

		const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
		XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

		// Detailed borrows sheet
		const detailedSheet = XLSX.utils.json_to_sheet(
			analytics.detailedBorrows.map((borrow) => ({
				"Borrow ID": borrow.id,
				"Borrowed At": borrow.borrowedAt,
				"Due At": borrow.dueAt,
				"Returned At": borrow.returnedAt || "",
				"Approved At": borrow.approvedAt || "",
				Status: borrow.status,
				"Overdue Days": borrow.overdueDays || "",
				"User Name": borrow.user.name,
				"User Email": borrow.user.email,
				"Book Title": borrow.book.title,
				"Book Author": borrow.book.author,
				"Book ISBN": borrow.book.isbn,
				"Shelf Location": borrow.book.shelfLocation,
			}))
		);
		XLSX.utils.book_append_sheet(workbook, detailedSheet, "Detailed Borrows");

		// Top borrowed books sheet
		const topBooksSheet = XLSX.utils.json_to_sheet(
			analytics.topBorrowedBooks.map((item) => ({
				"Book Title": item.book.title,
				Author: item.book.author,
				ISBN: item.book.isbn,
				"Borrow Count": item.count,
			}))
		);
		XLSX.utils.book_append_sheet(workbook, topBooksSheet, "Top Borrowed Books");

		// Most active borrowers sheet
		const activeBorrowersSheet = XLSX.utils.json_to_sheet(
			analytics.mostActiveBorrowers.map((item) => ({
				"User Name": item.user.name,
				Email: item.user.email,
				"Borrow Count": item.count,
			}))
		);
		XLSX.utils.book_append_sheet(workbook, activeBorrowersSheet, "Active Borrowers");

		const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

		res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename=borrow-report-${start.toISOString().split("T")[0]}-to-${end.toISOString().split("T")[0]}.xlsx`
		);
		return res.send(buffer);
	}

	// Default JSON response
	res.status(200).json({
		success: true,
		data: analytics,
	});
});

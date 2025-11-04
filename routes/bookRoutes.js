import express from "express";

import * as bookController from "../controllers/bookController.js";
import * as authController from "../controllers/authController.js";

const router = express.Router();

router
	.route("/")
	.get(bookController.getAllBooks) // No restrictions required
	.post(authController.protect, authController.restrictTo("ADMIN"), bookController.createBook); // admin create a book

router
	.route("/:id")
	.get(bookController.getBookById) // No restrictions required
	.patch(authController.protect, authController.restrictTo("ADMIN"), bookController.updateBook) // admin updates a book by ID
	.delete(authController.protect, authController.restrictTo("ADMIN"), bookController.deleteBook); // admin deletes a book by ID

export default router;

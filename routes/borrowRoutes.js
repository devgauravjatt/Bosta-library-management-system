import express from "express";

import * as borrowController from "../controllers/borrowController.js";
import * as authController from "../controllers/authController.js";

const router = express.Router();

router.use(authController.protect);

// Reports routes (admin only)
router.route("/reports").get(authController.restrictTo("ADMIN"), borrowController.getBorrowReports);

router
	.route("/")
	.get(borrowController.getAllBorrows) // admin gets all borrows, users get their own
	.post(borrowController.createBorrow); // user creates a borrow request

router
	.route("/:id")
	.get(borrowController.getBorrowById) // user or admin gets a borrow by ID
	.patch(borrowController.updateBorrow) // user or admin updates a borrow by ID
	.delete(borrowController.deleteBorrow); // user or admin deletes a borrow by ID

export default router;

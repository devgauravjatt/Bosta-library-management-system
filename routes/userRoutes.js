import express from "express";

import * as userController from "../controllers/userController.js";
import * as authController from "../controllers/authController.js";

const router = express.Router();

router.use(authController.protect);
router.use(authController.restrictTo("ADMIN"));

router
	.route("/")
	.get(userController.getAllUsers) // admin gets all users
	.post(userController.createUser); // admin create a user

router
	.route("/:id")
	.get(userController.getUserById) // admin gets a user by ID
	.patch(userController.updateUser) // admin updates a user by ID
	.delete(userController.deleteUser); // admin deletes a user by ID

export default router;

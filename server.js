import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

process.on("uncaughtException", (err) => {
	console.log("UNCAUGHT EXCEPTION! Shutting down...");
	console.error(err);
	console.error(err.name, err.message);
	process.exit(1);
});

import app from "./app.js";

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});

process.on("unhandledRejection", (err) => {
	console.log("UNHANDLED REJECTION! Shutting down...");
	console.error(err.name, err.message);
	server.close(() => {
		process.exit(1);
	});
});

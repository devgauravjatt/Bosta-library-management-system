import request from "supertest";
import app from "../app.js";
import prisma from "../prisma/client.js";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "jest";

describe("Book Routes - GET /api/v1/books", () => {
	beforeAll(async () => {
		// Clean database
		await prisma.book.deleteMany();
		await prisma.user.deleteMany();
	});

	afterAll(async () => {
		// Clean up
		await prisma.book.deleteMany();
		await prisma.user.deleteMany();
		await prisma.$disconnect();
	});

	beforeEach(async () => {
		// Clean books before each test
		await prisma.book.deleteMany();
	});

	it("should get all books when no filters are applied", async () => {
		// Seed test books
		await prisma.book.createMany({
			data: [
				{
					isbn: "1234567890",
					title: "Test Book 1",
					author: "Author 1",
					shelfLocation: "A1",
					totalQuantity: 5,
					availableQuantity: 5,
				},
				{
					isbn: "0987654321",
					title: "Test Book 2",
					author: "Author 2",
					shelfLocation: "B1",
					totalQuantity: 3,
					availableQuantity: 3,
				},
			],
		});

		const res = await request(app).get("/api/v1/books");

		expect(res.statusCode).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.books).toHaveLength(2);
	});

	it("should filter books by title", async () => {
		await prisma.book.create({
			data: {
				isbn: "1111111111",
				title: "JavaScript Guide",
				author: "Tech Author",
				shelfLocation: "C1",
				totalQuantity: 2,
				availableQuantity: 2,
			},
		});

		const res = await request(app).get("/api/v1/books?title=JavaScript");

		expect(res.statusCode).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.books).toHaveLength(1);
		expect(res.body.data.books[0].title).toBe("JavaScript Guide");
	});

	it("should filter books by author", async () => {
		await prisma.book.createMany({
			data: [
				{
					isbn: "2222222222",
					title: "Node.js Handbook",
					author: "John Doe",
					shelfLocation: "D1",
					totalQuantity: 3,
					availableQuantity: 3,
				},
				{
					isbn: "3333333333",
					title: "React Guide",
					author: "Jane Smith",
					shelfLocation: "D2",
					totalQuantity: 2,
					availableQuantity: 2,
				},
			],
		});

		const res = await request(app).get("/api/v1/books?author=John");

		expect(res.statusCode).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.books).toHaveLength(1);
		expect(res.body.data.books[0].author).toBe("John Doe");
	});

	it("should filter books by ISBN", async () => {
		await prisma.book.create({
			data: {
				isbn: "4444444444",
				title: "Express.js Tutorial",
				author: "Tech Expert",
				shelfLocation: "E1",
				totalQuantity: 1,
				availableQuantity: 1,
			},
		});

		const res = await request(app).get("/api/v1/books?isbn=4444444444");

		expect(res.statusCode).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.books).toHaveLength(1);
		expect(res.body.data.books[0].isbn).toBe("4444444444");
	});
});

require("dotenv").config();
const multer = require("multer");
const Minio = require("minio");
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const authenticateUser = require("../middleware/authenticateUser");

// MinIO Configuration
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT,
    port: parseInt(process.env.MINIO_PORT, 10),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

const RECORDING_BUCKET_NAME = process.env.MINIO_RECORDING_BUCKET_NAME;
const TRANSCRIPTION_BUCKET_NAME = process.env.MINIO_TRANSCRIPTION_BUCKET_NAME;
const SUMMARIZATION_BUCKET_NAME = process.env.MINIO_SUMMARIZATION_BUCKET_NAME;

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Video Upload Route
// router.post("/upload", upload.single("video"), async (req, res) => {
//     if (!req.file) return res.status(400).json({ error: "No file uploaded" });

//     const filename = req.file.originalname;
//     console.log("File Name: ", filename);
//     console.log("File Size: ", req.file.size);
//     console.log("File Type: ", req.file.mimetype);

//     try {
//         await minioClient.putObject(
//             MINIO_RECORDING_BUCKET_NAME,
//             filename,
//             req.file.buffer,
//             req.file.size,
//             { "Content-Type": req.file.mimetype }
//         );

//         return res.json({ message: "File uploaded successfully", filename });
//     } catch (error) {
//         console.error("MinIO Upload Error:", error);
//         return res.status(500).json({ error: "Failed to upload file" });
//     }
// });

// router.get("/getfile/:filename", async (req, res) => {
//     const { filename } = req.params;

//     try {
//         const fileStream = await minioClient.getObject(BUCKET_NAME, filename);

//         res.setHeader("Content-Type", "video/webm");
//         fileStream.pipe(res);  // Stream the file to the response
//     } catch (error) {
//         console.error("MinIO Fetch Error:", error);
//         return res.status(500).json({ error: "Failed to retrieve file" });
//     }
// });

router.post("/upload-video", authenticateUser, upload.single("video"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filename = `${req.file.originalname}`;
    const fileBuffer = req.file.buffer;
    const userId = req.user.userId;

    const { title } = req.body;
    console.log("Title : ", title);

    try {
        await minioClient.putObject(
            RECORDING_BUCKET_NAME,
            filename,
            fileBuffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
        );

        const videoUrl = `${process.env.MINIO_PUBLIC_URL}/${RECORDING_BUCKET_NAME}/${filename}`;

        const meeting = await prisma.meeting.create({
            data: {
                title: title,
                recordingurl: videoUrl,
            },
        });

        await prisma.meetingUser.create({
            data: {
                userId,
                meetingId: meeting.id,
            },
        });
        console.log("Recording uploaded successfully");
        return res.json({ message: "File uploaded successfully", videoUrl, meetingId: meeting.id });
    } catch (error) {
        console.error("MinIO Upload Error:", error);
        return res.status(500).json({ error: "Failed to upload file" });
    }
});

router.post("/upload-transcription/:meetingId", authenticateUser, upload.single("transcription"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filename = `${req.file.originalname}`;
    const fileBuffer = req.file.buffer;
    const { meetingId } = req.params;

    try {
        await minioClient.putObject(
            TRANSCRIPTION_BUCKET_NAME,
            filename,
            fileBuffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
        );

        const transcriptionUrl = `${process.env.MINIO_PUBLIC_URL}/${TRANSCRIPTION_BUCKET_NAME}/${filename}`;

        await prisma.meeting.update({
            where: { id: meetingId },
            data: { transcripturl: transcriptionUrl },
        });
        console.log("Transcription uploaded successfully!");
        return res.json({ message: "Transcription uploaded successfully", transcriptionUrl });
    } catch (error) {
        console.error("MinIO Upload Error:", error);
        return res.status(500).json({ error: "Failed to upload transcription" });
    }
});

router.post("/upload-summarization/:meetingId", authenticateUser, upload.single("summarization"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filename = `${req.file.originalname}`;
    const fileBuffer = req.file.buffer;
    const { meetingId } = req.params;

    try {
        await minioClient.putObject(
            SUMMARIZATION_BUCKET_NAME,
            filename,
            fileBuffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
        );

        const summarizationUrl = `${process.env.MINIO_PUBLIC_URL}/${SUMMARIZATION_BUCKET_NAME}/${filename}`;

        await prisma.meeting.update({
            where: { id: meetingId },
            data: { summarizationurl: summarizationUrl },
        });
        console.log("Summarization uploaded successfully!");
        return res.json({ message: "Summarization uploaded successfully", summarizationUrl });
    } catch (error) {
        console.error("MinIO Upload Error:", error);
        return res.status(500).json({ error: "Failed to upload summarization" });
    }
});

router.get("/meetings", async (req, res) => {
    const { title } = req.query; // Extract title from query params

    try {
        const meetings = await prisma.meeting.findMany({
            where: title
                ? {
                      title: {
                          contains: title,
                          mode: "insensitive",
                      }
                  }
                : {},
            include: { users: true },
        });

        return res.json(meetings);
    } catch (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ error: "Failed to fetch meetings" });
    }
});

router.get('/meetings/:meetingId/video', authenticateUser, async (req, res) => {
    const meetingId = req.params.meetingId;
    // Fetch video URL from the database or storage
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { recordingurl: true },
    });

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    res.json({ videoUrl: meeting.recordingurl });
});

router.get('/meetings/:meetingId/transcription', authenticateUser, async (req, res) => {
    const meetingId = req.params.meetingId;
    // Fetch transcription URL from the database or storage
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: { transcripturl: true },
    });

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    res.json({ transcriptionUrl: meeting.transcripturl });
});

router.get("/meeting/:meetingId", async (req, res) => {
    const { meetingId } = req.params;

    try {
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
            include: { users: true },
        });

        if (!meeting) return res.status(404).json({ error: "Meeting not found" });

        return res.json(meeting);
    } catch (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ error: "Failed to fetch meeting details" });
    }
});

module.exports = router;

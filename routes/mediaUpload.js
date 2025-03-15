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
    const { title, email } = req.query;

    if (!email) {
        return res.status(400).json({ error: "Email is required" });
    }

    try {
        // Step 1: Fetch all entries from `meetingUser`
        const meetingUsers = await prisma.meetingUser.findMany({
            include: { user: true } // Include user data to filter by email
        });

        // Step 2: Filter users with the given email
        const filteredMeetingUsers = meetingUsers.filter((mu) => mu.user.email === email);

        // Step 3: Extract unique meeting IDs
        const meetingIds = [...new Set(filteredMeetingUsers.map((mu) => mu.meetingId))];

        // Step 4: Fetch meetings with the filtered IDs
        const meetings = await prisma.meeting.findMany({
            where: {
                id: { in: meetingIds },
                ...(title && {
                    title: {
                        contains: title,
                        mode: "insensitive"
                    }
                })
            },
            include: { users: true }
        });

        return res.json(meetings);
    } catch (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ error: "Failed to fetch meetings" });
    }
});

// router.post('/grant-access', authenticateUser, async (req, res) => {
//     const { emails, meetingId } = req.body;

//     console.log("Emails received to grant access : ", emails);
    
//     if (!emails || !Array.isArray(emails) || emails.length === 0) {
//         return res.status(400).json({ error: 'Emails array is required' });
//     }

//     try {
//         const users = await prisma.user.findMany({
//             where: { email: { in: emails } }
//         });

//         if (users.length === 0) {
//             return res.status(404).json({ error: 'No users found with the provided emails' });
//         }

//         // Fetch existing meeting users
//         const existingMeetingUsers = await prisma.meetingUser.findMany({
//             where: { meetingId }
//         });

//         const existingUserIds = existingMeetingUsers.map(mu => mu.userId);

//         // Filter out users who already have access
//         const newUsers = users.filter(user => !existingUserIds.includes(user.id));

//         if (newUsers.length === 0) {
//             return res.status(400).json({ error: 'All provided users already have access' });
//         }

//         const meetingUsersData = newUsers.map(user => ({
//             userId: user.id,
//             meetingId
//         }));

//         await prisma.meetingUser.createMany({
//             data: meetingUsersData,
//             skipDuplicates: true
//         });

//         return res.json({ message: 'Access granted successfully' });
//     } catch (error) {
//         console.error('Database Error:', error);
//         return res.status(500).json({ error: 'Failed to grant access' });
//     }
// });

router.post('/grant-access', authenticateUser, async (req, res) => {
    const { emails, meetingId } = req.body;

    if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ error: 'Emails array is required' });
    }

    try {
        // Fetch users corresponding to the provided emails
        const users = await prisma.user.findMany({
            where: { email: { in: emails } },
            select: { id: true }
        });

        const newUserIds = users.map(user => user.id);

        // Fetch current meeting users from DB
        const existingMeetingUsers = await prisma.meetingUser.findMany({
            where: { meetingId },
            select: { userId: true }
        });

        const existingUserIds = existingMeetingUsers.map(mu => mu.userId);

        // Users to be added (newly granted access)
        const usersToAdd = newUserIds.filter(userId => !existingUserIds.includes(userId));

        // Users to be removed (no longer in the provided list)
        const usersToRemove = existingUserIds.filter(userId => !newUserIds.includes(userId));

        // Add new users
        if (usersToAdd.length > 0) {
            const meetingUsersData = usersToAdd.map(userId => ({
                userId,
                meetingId
            }));

            await prisma.meetingUser.createMany({
                data: meetingUsersData,
                skipDuplicates: true
            });
        }

        // Remove users who are no longer in the provided email list
        if (usersToRemove.length > 0) {
            await prisma.meetingUser.deleteMany({
                where: {
                    meetingId,
                    userId: { in: usersToRemove }
                }
            });
        }

        return res.json({ message: 'Access updated successfully' });
    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ error: 'Failed to update access' });
    }
});

router.get("/meeting-users", async (req, res) => {
    try {
        const meetingUsers = await prisma.meetingUser.findMany({
            include: {
                meeting: true,
                user: true
            }
        });

        return res.json(meetingUsers);
    } catch (error) {
        console.error("Database Error:", error);
        return res.status(500).json({ error: "Failed to fetch meeting users" });
    }
});

router.get('/meetings/:meetingId', authenticateUser, async (req, res) => {
    const meetingId = req.params.meetingId;

    try {
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
            include: {
                users: {
                    include: {
                        user: {
                            select: {
                                username: true,
                                email: true
                            }
                        }
                    }
                }
            }
        });

        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

        const accessList = meeting.users.map(meetingUser => ({
            username: meetingUser.user.username,
            email: meetingUser.user.email
        }));

        return res.json({ meeting, accessList });
    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ error: 'Failed to fetch meeting details' });
    }
});

router.put('/meetings/:meetingId', authenticateUser, async (req, res) => {
    const { meetingId } = req.params;
    const { title } = req.body;

    try {
        const updatedMeeting = await prisma.meeting.update({
            where: { id: meetingId },
            data: { title },
        });

        return res.json({ message: 'Meeting updated successfully', updatedMeeting });
    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ error: 'Failed to update meeting' });
    }
});

router.delete('/meetings/:meetingId', authenticateUser, async (req, res) => {
    const { meetingId } = req.params;

    try {
        // Delete related MeetingUser entries first
        await prisma.meetingUser.deleteMany({
            where: { meetingId },
        });

        // Delete the meeting
        await prisma.meeting.delete({
            where: { id: meetingId },
        });

        return res.json({ message: 'Meeting deleted successfully' });
    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ error: 'Failed to delete meeting' });
    }
}); 

module.exports = router;

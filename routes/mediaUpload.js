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

router.post("/upload-video", authenticateUser, upload.single("video"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filename = `${req.file.originalname}`;
    const fileBuffer = req.file.buffer;
    const userId = req.user.userId;  // Get the logged-in user's ID

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

        // Create meeting with ownerId
        const meeting = await prisma.meeting.create({
            data: {
                title: title,
                recordingurl: videoUrl,
                ownerId: userId,  // Assign the owner of the meeting
            },
        });

        // Add the user to the MeetingUser table
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

router.post('/grant-access', authenticateUser, async (req, res) => {
    const { emails, meetingId } = req.body;
    const userId = req.user.userId;

    if (!emails || !Array.isArray(emails)) {
        return res.status(400).json({ error: 'Emails array is required' });
    }

    try {
        // Fetch the meeting and check ownership
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
        });

        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        if (meeting.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

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
    const userId = req.user.userId; // Authenticated user's ID

    try {
        // Fetch the meeting and check ownership
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
        });

        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        if (meeting.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        // Update the meeting title
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
    const userId = req.user.userId;

    try {
        // Fetch the meeting and check ownership
        const meeting = await prisma.meeting.findUnique({
            where: { id: meetingId },
        });

        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        if (meeting.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

        // Extract file URLs
        const { recordingurl, transcripturl, summarizationurl } = meeting;

        // Function to delete an object from MinIO
        const deleteMinIOObject = async (bucket, fileUrl) => {
            if (!fileUrl) return;  // Skip if no file exists

            const filename = fileUrl.split('/').pop(); // Extract filename from URL

            try {
                await minioClient.removeObject(bucket, filename);
                console.log(`Deleted ${filename} from ${bucket}`);
            } catch (error) {
                console.error(`Failed to delete ${filename} from ${bucket}:`, error);
            }
        };

        // Delete files from MinIO
        await Promise.all([
            deleteMinIOObject(RECORDING_BUCKET_NAME, recordingurl),
            deleteMinIOObject(TRANSCRIPTION_BUCKET_NAME, transcripturl),
            deleteMinIOObject(SUMMARIZATION_BUCKET_NAME, summarizationurl)
        ]);

        // Delete meeting and associated records
        await prisma.meetingUser.deleteMany({ where: { meetingId } }); // Remove meeting-user links
        await prisma.meeting.delete({ where: { id: meetingId } }); // Delete meeting

        return res.json({ message: 'Meeting and associated files deleted successfully' });
    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ error: 'Failed to delete meeting' });
    }
});

module.exports = router;

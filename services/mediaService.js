const Minio = require("minio");
const prisma = require('../models/prismaClient');

class MediaService {
  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT,
      port: parseInt(process.env.MINIO_PORT, 10),
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });

    this.RECORDING_BUCKET = process.env.MINIO_RECORDING_BUCKET_NAME;
    this.TRANSCRIPTION_BUCKET = process.env.MINIO_TRANSCRIPTION_BUCKET_NAME;
    this.SUMMARIZATION_BUCKET = process.env.MINIO_SUMMARIZATION_BUCKET_NAME;
  }

  async uploadVideo(file, userId, title) {
    const filename = file.originalname;
    const fileBuffer = file.buffer;

    // Upload to MinIO
    await this.minioClient.putObject(
      this.RECORDING_BUCKET,
      filename,
      fileBuffer,
      file.size,
      { "Content-Type": file.mimetype }
    );

    const videoUrl = `${process.env.MINIO_PUBLIC_URL}/${this.RECORDING_BUCKET}/${filename}`;

    // Create meeting 
    const meeting = await prisma.meeting.create({
      data: {
        title: title,
        recordingurl: videoUrl,
        ownerId: userId,
      },
    });

    // Add user to meeting
    await prisma.meetingUser.create({
      data: {
        userId,
        meetingId: meeting.id,
      },
    });

    return { 
      message: "File uploaded successfully", 
      videoUrl, 
      meetingId: meeting.id 
    };
  }

  async uploadTranscription(file, meetingId) {
    const filename = file.originalname;
    const fileBuffer = file.buffer;

    // Upload to MinIO
    await this.minioClient.putObject(
      this.TRANSCRIPTION_BUCKET,
      filename,
      fileBuffer,
      file.size,
      { "Content-Type": file.mimetype }
    );

    const transcriptionUrl = `${process.env.MINIO_PUBLIC_URL}/${this.TRANSCRIPTION_BUCKET}/${filename}`;

    // Update meeting with transcription URL
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { transcripturl: transcriptionUrl },
    });

    return { 
      message: "Transcription uploaded successfully", 
      transcriptionUrl 
    };
  }

  async uploadSummarization(file, meetingId) {
    const filename = file.originalname;
    const fileBuffer = file.buffer;

    // Upload to MinIO
    await this.minioClient.putObject(
      this.SUMMARIZATION_BUCKET,
      filename,
      fileBuffer,
      file.size,
      { "Content-Type": file.mimetype }
    );

    const summarizationUrl = `${process.env.MINIO_PUBLIC_URL}/${this.SUMMARIZATION_BUCKET}/${filename}`;

    // Update meeting with summarization URL
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { summarizationurl: summarizationUrl },
    });

    return { 
      message: "Summarization uploaded successfully", 
      summarizationUrl 
    };
  }

  async getMeetings(email, title) {
    // Fetch meetings for a specific user and optional title filter
    const meetingUsers = await prisma.meetingUser.findMany({
      include: { user: true, meeting: true }
    });

    const filteredMeetings = meetingUsers
      .filter((mu) => mu.user.email === email)
      .map((mu) => mu.meeting)
      .filter((meeting) => 
        !title || 
        meeting.title.toLowerCase().includes(title.toLowerCase())
      );

    return filteredMeetings;
  }

  async grantAccess(userId, emails, meetingId) {
    // Fetch the meeting and check ownership
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) throw new Error('Meeting not found');
    if (meeting.ownerId !== userId) throw new Error('Unauthorized');

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

    return { message: 'Access updated successfully' };
  }
}

module.exports = new MediaService();
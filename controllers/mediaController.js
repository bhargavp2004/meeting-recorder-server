const MediaService = require('../services/mediaService');
const prisma = require('../models/prismaClient');

class MediaController {
  async uploadVideo(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const result = await MediaService.uploadVideo(
        req.file, 
        req.user.userId, 
        req.body.title
      );

      res.json(result);
    } catch (error) {
      console.error("Upload Error:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  }

  async uploadTranscription(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const result = await MediaService.uploadTranscription(
        req.file, 
        req.params.meetingId
      );

      res.json(result);
    } catch (error) {
      console.error("Transcription Upload Error:", error);
      res.status(500).json({ error: "Failed to upload transcription" });
    }
  }

  async uploadSummarization(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const result = await MediaService.uploadSummarization(
        req.file, 
        req.params.meetingId
      );

      res.json(result);
    } catch (error) {
      console.error("Summarization Upload Error:", error);
      res.status(500).json({ error: "Failed to upload summarization" });
    }
  }

  async getMeetings(req, res) {
    try {
      const { title, email } = req.query;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const meetings = await MediaService.getMeetings(email, title);
      res.json(meetings);
    } catch (error) {
      console.error("Database Error:", error);
      res.status(500).json({ error: "Failed to fetch meetings" });
    }
  }

  async grantAccess(req, res) {
    try {
      const { emails, meetingId } = req.body;
      const userId = req.user.userId;

      const result = await MediaService.grantAccess(userId, emails, meetingId);
      res.json(result);
    } catch (error) {
      console.error('Database Error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  async getMeetingDetails(req, res) {
    try {
      const meetingId = req.params.meetingId;

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

      res.json({ meeting, accessList });
    } catch (error) {
      console.error('Database Error:', error);
      res.status(500).json({ error: 'Failed to fetch meeting details' });
    }
  }

  async updateMeeting(req, res) {
    try {
      const { meetingId } = req.params;
      const { title } = req.body;
      const userId = req.user.userId;

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

      res.json({ message: 'Meeting updated successfully', updatedMeeting });
    } catch (error) {
      console.error('Database Error:', error);
      res.status(500).json({ error: 'Failed to update meeting' });
    }
  }

  async deleteMeeting(req, res) {
    try {
      const { meetingId } = req.params;
      const userId = req.user.userId;

      // Fetch the meeting and check ownership
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
      });

      if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
      if (meeting.ownerId !== userId) return res.status(403).json({ error: 'Unauthorized' });

      // Delete files from MinIO
      const deleteMinIOObject = async (bucket, fileUrl) => {
        if (!fileUrl) return;
        const filename = fileUrl.split('/').pop();
        await MediaService.minioClient.removeObject(bucket, filename);
      };

      await Promise.all([
        deleteMinIOObject(MediaService.RECORDING_BUCKET, meeting.recordingurl),
        deleteMinIOObject(MediaService.TRANSCRIPTION_BUCKET, meeting.transcripturl),
        deleteMinIOObject(MediaService.SUMMARIZATION_BUCKET, meeting.summarizationurl)
      ]);

      // Delete meeting and associated records
      await prisma.meetingUser.deleteMany({ where: { meetingId } });
      await prisma.meeting.delete({ where: { id: meetingId } });

      res.json({ message: 'Meeting and associated files deleted successfully' });
    } catch (error) {
      console.error('Database Error:', error);
      res.status(500).json({ error: 'Failed to delete meeting' });
    }
  }
}

module.exports = new MediaController();
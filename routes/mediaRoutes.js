const express = require("express");
const multer = require("multer");
const router = express.Router();

const MediaController = require('../controllers/mediaController');
const { 
  uploadVideoValidationSchema, 
  grantAccessValidationSchema,
  validate 
} = require('../validators/mediaValidator');
const authenticateUser = require('../middleware/authenticateUser');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post(
  "/upload-video", 
  authenticateUser,
  upload.single("video"),
  validate(uploadVideoValidationSchema),
  MediaController.uploadVideo
);

router.post(
  "/upload-transcription/:meetingId", 
  authenticateUser, 
  upload.single("transcription"),
  MediaController.uploadTranscription
);

router.post(
  "/upload-summarization/:meetingId", 
  authenticateUser, 
  upload.single("summarization"),
  MediaController.uploadSummarization
);

router.get("/meetings", MediaController.getMeetings);

router.post(
  '/grant-access', 
  authenticateUser, 
  validate(grantAccessValidationSchema),
  MediaController.grantAccess
);

router.get('/meetings/:meetingId', authenticateUser, MediaController.getMeetingDetails);

router.put('/meetings/:meetingId', authenticateUser, MediaController.updateMeeting);

router.delete('/meetings/:meetingId', authenticateUser, MediaController.deleteMeeting);

module.exports = router;
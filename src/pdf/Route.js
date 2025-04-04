// backend/src/pdf/pdfRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const s3 = require('./../config/b2Config');
const PdfFile = require('./Model');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
// Multer in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/pdfs - Upload a PDF
router.post('/', upload.single('pdf'), async (req, res) => {
  try {
    const { title, description, type } = req.body;
    if (!req.file) return res.status(400).json({ msg: 'No PDF file uploaded' });
    if (!title) return res.status(400).json({ msg: 'Title is required' });
    if (!type) return res.status(400).json({ msg: 'Type is required' });

    const fileKey = `${Date.now()}-${req.file.originalname}`;
    const params = {
      Bucket: process.env.B2_S3_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: 'application/pdf',
    };

    await s3.upload(params).promise();

    const publicUrl = `${process.env.B2_S3_ENDPOINT}/${process.env.B2_S3_BUCKET_NAME}/${fileKey}`;

    const newPdf = await PdfFile.create({ title, description, type, fileKey, fileUrl: publicUrl });
    return res.status(201).json({ msg: 'PDF uploaded successfully', pdf: newPdf });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(error.name === 'ValidationError' ? 400 : 500).json({ msg: error.message });
  }
});


// GET /api/pdfs - Fetch all PDFs
router.get('/', async (req, res) => {
  try {
    const pdfs = await PdfFile.find().sort({ createdAt: -1 });
    const pdfsWithoutUrl = pdfs.map(pdf => ({ ...pdf._doc, fileUrl: undefined }));
    res.json(pdfs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/pdfs/:id - Update PDF Title
router.put('/:id', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ msg: 'Title is required' });

    const updatedPdf = await PdfFile.findByIdAndUpdate(
      req.params.id,
      { title },
      { new: true }
    );
    if (!updatedPdf) return res.status(404).json({ msg: 'PDF not found' });

    res.json({ msg: 'PDF updated successfully', pdf: updatedPdf });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/pdfs/:id - Delete the PDF
// DELETE /api/pdfs/:id - Delete the PDF
router.delete('/:id', async (req, res) => {
  try {
    const pdf = await PdfFile.findById(req.params.id);
    if (!pdf) return res.status(404).json({ msg: 'PDF not found' });

    // Remove from Backblaze (S3) first
    const deleteParams = {
      Bucket: process.env.B2_S3_BUCKET_NAME,
      Key: pdf.fileKey,
    };
    await s3.deleteObject(deleteParams).promise();

    // Then remove from database using deleteOne() instead of remove()
    await pdf.deleteOne();

    res.json({ msg: 'PDF deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});



router.get('/:id', async (req, res) => {
  try {
    const pdfDoc = await PdfFile.findById(req.params.id);
    if (!pdfDoc) {
      return res.status(404).json({ msg: 'PDF not found' });
    }
    
    // Generate a new signed URL for the PDF
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.B2_S3_BUCKET_NAME,
      Key: pdfDoc.fileKey,
      Expires: 604800, // Maximum allowed: 1 week
    });
    
    res.json({ fileUrl: signedUrl });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});


router.get("/signed-url/:fileKey", async (req, res) => {
  try {
    const { fileKey } = req.params;

    const signedUrl = s3.getSignedUrl("getObject", {
      Bucket: process.env.B2_S3_BUCKET_NAME,
      Key: fileKey,
      Expires: 604800, // Maximum allowed (1 week)
    });

    res.json({ fileUrl: signedUrl });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    res.status(500).json({ msg: "Error generating signed URL" });
  }
});




module.exports = router;

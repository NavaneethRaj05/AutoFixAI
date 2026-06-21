import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  path:         { type: String, required: true },
  line:         { type: Number, required: true },
  severity: {
    type:  String,
    enum:  ['bug', 'security', 'performance', 'style', 'suggestion'],
    index: true,
  },
  comment:      { type: String, required: true },
  suggestedFix: { type: String, default: null }, // GitHub one-click suggestion code
});

const reviewSchema = new mongoose.Schema(
  {
    repo:     { type: String, required: true, index: true },
    prNumber: { type: Number, required: true, index: true },
    prTitle:  { type: String, default: '' },
    headSha:  { type: String, required: true },
    author:   { type: String, default: 'unknown' },
    comments: [commentSchema],

    // AI-generated PR summary (Feature: PR Summary Generator)
    summary:   { type: String, default: null },
    verdict: {
      type:    String,
      enum:    ['APPROVE', 'REQUEST_CHANGES', 'CRITICAL_ISSUES', null],
      default: null,
    },
    riskLevel: {
      type:    String,
      enum:    ['low', 'medium', 'high', 'critical', null],
      default: null,
    },

    status:   {
      type:    String,
      enum:    ['pending', 'completed', 'failed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Compound index for quick lookup
reviewSchema.index({ repo: 1, prNumber: 1 });

export default mongoose.model('Review', reviewSchema);

const Joi = require('joi');

const uploadVideoValidationSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title must be at most 100 characters long',
      'any.required': 'Title is required'
    })
});

const grantAccessValidationSchema = Joi.object({
  emails: Joi.array()
    .items(
      Joi.string()
        .email({ minDomainSegments: 2, tlds: { allow: ['com', 'net', 'org'] } })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one email is required',
      'array.base': 'Emails must be an array',
      'string.email': 'Invalid email format'
    }),
  
  meetingId: Joi.string()
    .required()
    .messages({
      'any.required': 'Meeting ID is required'
    })
});

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => detail.message)
      });
    }
    
    next();
  };
};

module.exports = {
  uploadVideoValidationSchema,
  grantAccessValidationSchema,
  validate
};
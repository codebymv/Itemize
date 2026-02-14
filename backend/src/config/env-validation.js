module.exports.validateEnv = () => {
  const required = [
    { var: 'JWT_SECRET', name: 'JWT Secret' },
    { var: 'DATABASE_URL', name: 'Database URL' },
    { var: 'FRONTEND_URL', name: 'Frontend URL' },
  ];
  
  const optional = [
    { var: 'SENTRY_DSN', name: 'Sentry DSN' },
    { var: 'RESEND_API_KEY', name: 'Resend API Key' },
    { var: 'TWILIO_ACCOUNT_SID', name: 'Twilio Account SID' },
    { var: 'GOOGLE_CLIENT_ID', name: 'Google Client ID' },
  ];
  
  const missing = required.filter(v => !process.env[v.var]);
  if (missing.length > 0) {
    console.error('FATAL: Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v.name} (${v.var})`));
    process.exit(1);
  }
  
  const missingOptional = optional.filter(v => !process.env[v.var]);
  if (missingOptional.length > 0) {
    console.warn('Warning: Missing optional environment variables:');
    missingOptional.forEach(v => {
      console.warn(`  - ${v.name} (${v.var})`);
    });
  }
  
  return {
    allPresent: missing.length === 0,
    requiredCount: required.length,
    optionalCount: optional.length,
  };
};
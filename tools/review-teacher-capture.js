/* Offline replay: node tools/review-teacher-capture.js input.json output.json */
'use strict';
const fs=require('fs');
const path=require('path');
if (process.argv.length!==4) {
  console.error('Usage: node tools/review-teacher-capture.js input.json output.json');
  process.exitCode=2;
} else {
  const capture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if (capture.timezone) {
    new Intl.DateTimeFormat('en',{timeZone:capture.timezone});
    process.env.TZ=capture.timezone;
  }
  const metrics=require('../grok/study-metrics.js');
  const result=require('./teacher-data-audit.js').compare(capture,metrics);
  const target=path.resolve(process.argv[3]);
  fs.writeFileSync(target,JSON.stringify(result,null,2));
  console.log(JSON.stringify({students:result.total,consistent:result.verified,requiresReview:result.total-result.verified,
    stableCapture:result.consistency.stable,resultFile:target}));
}

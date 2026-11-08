# QuizMario project instructions

For work on `grok/`, its tests, or release tooling, follow the learning data rules in `.cursor/rules/learning-data-integrity.mdc`.

Preserve account ownership and original records. An uploaded acknowledgement, an independently measured learning ability, and a derived score are different facts; do not substitute one for another.

Use `node tools/verify-learning-contracts.js` for the automatic release checks. The workflow must pass the same checks before deploying. Fix the implementation or a demonstrated stale fixture; never hide a failure or reduce the stated accuracy boundary.

Keep private captures and audit exports outside the repository. Update the calculation version and cache versions when their semantics change. Scope changes to the intended product; the root legacy track and `grok/` can have different teaching policies.

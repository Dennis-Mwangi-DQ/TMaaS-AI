# Questions to Ask the AI Readiness Agent

Upload `ai_readiness_evidence_pack.docx` first. Then ask these questions one at a time.

## Opening Questions

1. Based on the document I uploaded, what is the strongest AI use case we should assess first?
2. What evidence did you extract about our data accessibility?
3. What evidence did you extract about data quality history?
4. Which parts of the document suggest we are ready for an AI pilot?

## Probing Questions

5. Do you see any contradictions in the document?
6. Leadership says we have a single source of truth. Is that supported by the evidence?
7. What should you ask me next before scoring systems integration?
8. Which readiness dimensions are documented clearly, and which are only inferred?

## Scoring Questions

9. Score the seven readiness dimensions from 0 to 2 using only the uploaded evidence.
10. Which dimension is the biggest blocker for a demand forecasting pilot?
11. What additional information do you need before completing the assessment?
12. If you had to assign a readiness level now, what would it be and why?

## Completion Questions

13. What are the top three blockers we need to fix before deploying AI?
14. What should our first two-week action sprint include?
15. Complete the assessment and generate the final recommendation.

## Expected Behaviors to Watch For

- The agent should notice the contradiction between "single source of truth" and customer identifier mismatch.
- The agent should treat demand forecasting as more ready than churn prediction.
- The agent should identify data quality, systems integration, and adoption as material risks.
- The agent should not claim full readiness just because there is a cloud warehouse.
- The agent should ask follow-up questions about baseline forecast accuracy, product ownership, and manager adoption.

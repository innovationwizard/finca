-- Drop the deprecated notebook-photo OCR dictionary (flow removed entirely).
-- No remaining code references it; learned-correction rows were intentionally
-- discarded per the teardown decision (2026-06-16).
DROP TABLE "notebook_dictionary";

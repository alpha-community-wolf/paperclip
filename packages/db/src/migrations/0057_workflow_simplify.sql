-- COM-713: Simplify workflow templates — drop variables column, strip title from steps
ALTER TABLE "workflow_templates" DROP COLUMN IF EXISTS "variables";

-- Strip "title" key from existing step JSONB arrays (cleanup — the field is simply ignored if present)
UPDATE "workflow_templates"
SET "steps" = (
  SELECT jsonb_agg(step - 'title')
  FROM jsonb_array_elements("steps") AS step
)
WHERE "steps"::text LIKE '%"title"%';

-- Migration: add AI-generated summary explanation to block_plan_horizons
alter table block_plan_horizons add column if not exists summary_explanation text;

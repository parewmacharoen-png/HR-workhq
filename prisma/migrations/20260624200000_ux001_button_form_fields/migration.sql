-- UX-001 — Button-based form field types
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'button_select';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'button_multi_select';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'quick_amount';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'quick_date';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'quick_time';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'bank_picker';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'relationship_picker';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'leave_type_picker';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'shift_picker';
ALTER TYPE workflow.request_form_field_type ADD VALUE IF NOT EXISTS 'document_type_picker';

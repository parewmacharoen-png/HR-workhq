-- Split ID verification into card photo + holding photo
ALTER TYPE employee.self_onboarding_document_type ADD VALUE IF NOT EXISTS 'id_card_holding';

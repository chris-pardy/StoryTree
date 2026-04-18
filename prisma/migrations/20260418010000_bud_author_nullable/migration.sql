-- Make Bud.authorDid nullable so delete events on buds with descendants can
-- soft-delete (null the author, clear content) instead of hard-deleting and
-- orphaning the children.
ALTER TABLE "Bud" ALTER COLUMN "authorDid" DROP NOT NULL;

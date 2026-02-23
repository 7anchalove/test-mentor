-- Backfill existing protocol-less Google Meet links in sessions.meeting_link.
-- Safe update: only touches rows that begin with meet.google.com/ or www.meet.google.com/

update public.sessions
set meeting_link = 'https://' || meeting_link
where meeting_link is not null
  and (
    meeting_link ilike 'meet.google.com/%'
    or meeting_link ilike 'www.meet.google.com/%'
  );

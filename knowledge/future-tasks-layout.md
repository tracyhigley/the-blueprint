# Future Tasks page layout — decisions

- 2026-11-05: Done items are **deleted** (not just hidden) 10 days after they were marked done or sent to Field Notes. The live morning job does the deleting. (Tracy, 2026-11-05)
- 2026-11-05: Recurring tasks show their rule and next date, worked out from the task's date: "Every Monday · next Mon Nov 9", "Every other Monday", "Every month on the 3rd", "Every year on Nov 3". (Tracy, 2026-11-05: confirmed the wording is right)
- 2026-11-05: List rows show only the title and when. Notes and link stay stored, show in the edit form, and still go into the Field Note. (assumption, shown to Tracy)
- 2026-11-05: Two sections, Upcoming (every non-recurring task, undated "someday" ones last) and Recurring, plus a small Done list.
- 2026-11-05: "Building" is a dropdown of the existing buildings (Settings → Buildings), stored in a new optional `future_tasks.building` column (migration 0027, added to the live database on Tracy's yes, 2026-11-05). The building is passed to the Field Note's `area`, so it is preselected when triaging. (Tracy, 2026-11-05)

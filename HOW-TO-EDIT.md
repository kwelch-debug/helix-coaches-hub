# Helix Coaches Hub: how to change things

Everything you'll normally edit is in **one block at the top of `index.html`**, labeled `HUB DATA`. Open the file in any text editor. On GitHub, click the pencil icon.

| To change… | Edit this in HUB DATA |
|---|---|
| The four buttons under the header | `quickLinks` |
| Staff contact cards | `contacts` |
| Trainer flyers/protocols | `trainerLinks` |
| "Coming up" dates on This Week | `comingUp` (edit once a year) |
| Sports, head coaches, season dates, sit-out dates, league schedule links | `seasons` |
| Eligibility dates table | `eligibility` |
| Minimum days | `minimumDays` |
| Score form, Perry Weather, Instagram, MaxPreps, logo folder, etc. | `links` |
| Colors | `:root` at the top of the `<style>` block |

Rules:

- Dates are `"YYYY-MM-DD"`. A link left as `""` shows "Coming soon" instead of a dead link.
- **Never put student information on this site** (names, rosters, clearance status, grades, injuries). It is public.
- **Each season:** paste each league schedule link into that sport's `league: ""`. Before you link a conference file, check that its header shows the current season.
- **Each summer:** update `comingUp`, `seasons`, `eligibility` and `minimumDays` from the new school calendar and the CIF-SDS sheet.
- Once the calendar automation is running, it rewrites only the block between `FACILITY-CALENDAR:START` and `FACILITY-CALENDAR:END`. Commit every other edit to GitHub, or the next automated run will overwrite it.
- Deep links: add `#tabname` to the URL to text a coach straight to a tab. Tab names: `#week #contacts #schedules #score #publicity #clearance #eligibility #requirements #uniforms #transfers #facilities #finance #postseason #more`

## Setting up and deploying

See **SETUP.md**. It covers GitHub + Netlify, the score form and reminders, and the weekly clearance email.

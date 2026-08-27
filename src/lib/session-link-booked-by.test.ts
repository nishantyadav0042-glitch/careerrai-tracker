import { describe, it, expect } from 'vitest';
import { bookedNotificationBody, buddyBookedNotificationBody } from './session-link';

/**
 * The wording of a booking, for each of the three people it can describe.
 *
 * The self-serve path would otherwise have told a student "your buddy booked
 * a 1:1" about a slot the student picked seconds earlier — true of the sibling
 * route, false here, and the kind of small wrongness that makes a person stop
 * believing the join link in the same sentence.
 */
describe('bookedNotificationBody — who actually booked it', () => {
  const istTime = 'Fri, 29 Aug, 4:30 pm';
  const meetLink = 'https://meet.example/room';

  it('says the buddy booked it when the buddy booked it', () => {
    expect(bookedNotificationBody({ istTime, isOrientation: false, meetLink, bookedBy: 'buddy' }))
      .toContain('your buddy booked a 1:1');
  });

  it('does NOT credit the buddy when the student booked it themselves', () => {
    const body = bookedNotificationBody({
      istTime, isOrientation: false, meetLink, bookedBy: 'student',
    });
    expect(body).toContain('your 1:1 is booked');
    expect(body).not.toContain('your buddy booked');
  });

  it('keeps the existing wording when bookedBy is omitted', () => {
    // The sibling route passes no flag. Its message must not change.
    expect(bookedNotificationBody({ istTime, isOrientation: false, meetLink }))
      .toBe(bookedNotificationBody({ istTime, isOrientation: false, meetLink, bookedBy: 'buddy' }));
  });

  it('orientation wording ignores who booked — it is the same event either way', () => {
    const asStudent = bookedNotificationBody({ istTime, isOrientation: true, meetLink, bookedBy: 'student' });
    const asBuddy = bookedNotificationBody({ istTime, isOrientation: true, meetLink, bookedBy: 'buddy' });
    expect(asStudent).toBe(asBuddy);
    expect(asStudent).toContain('free orientation');
  });

  it('carries the join link in the message, and survives its absence', () => {
    expect(bookedNotificationBody({ istTime, isOrientation: false, meetLink, bookedBy: 'student' }))
      .toContain(meetLink);
    const noLink = bookedNotificationBody({
      istTime, isOrientation: false, meetLink: null, bookedBy: 'student',
    });
    expect(noLink).toContain(istTime);
    expect(noLink).not.toContain('Join here');
  });
});

describe('buddyBookedNotificationBody — the mentor is told a human took their hour', () => {
  const istTime = 'Fri, 29 Aug, 4:30 pm';

  it('names the student by first name only', () => {
    const body = buddyBookedNotificationBody({
      istTime, studentName: 'Dhruv Vakadia', meetLink: 'https://meet.example/room',
    });
    expect(body).toContain('Dhruv');
    expect(body).not.toContain('Vakadia');
  });

  it('states the time, so the mentor can act without opening the app', () => {
    expect(buddyBookedNotificationBody({ istTime, studentName: 'Dhruv', meetLink: null }))
      .toContain(istTime);
  });

  it('falls back to a person, not an empty string, when the name is missing', () => {
    expect(buddyBookedNotificationBody({ istTime, studentName: '', meetLink: null }))
      .toContain('A student');
  });

  it('carries the room link when there is one', () => {
    expect(buddyBookedNotificationBody({
      istTime, studentName: 'Dhruv', meetLink: 'https://meet.example/room',
    })).toContain('https://meet.example/room');
  });
});

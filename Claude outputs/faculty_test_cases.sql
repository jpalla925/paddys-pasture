-- =====================================================================
--  Faculty Web Page Database: Test Case Script
--  Database: facultywebdb (MySQL 8)
--
--  How to run (MySQL Workbench):
--    Put the cursor on one statement and press Ctrl+Enter to run just
--    that statement. Run them in order, top to bottom. Negative tests
--    are SUPPOSED to error; copy the Output panel message into the
--    "Actual Result" column and take a screenshot.
--
--  All test rows use IDs in the 9000s so they will not collide with
--  any data already in your tables. The CLEANUP section at the bottom
--  removes everything this script added.
-- =====================================================================

USE facultywebdb;

-- ---------------------------------------------------------------------
-- PRE-CHECK: confirm strict mode is on.
-- The result should include STRICT_TRANS_TABLES. If it does not,
-- TC-13 and TC-14 will succeed with only a warning instead of failing.
-- ---------------------------------------------------------------------
SELECT @@SESSION.sql_mode;


-- =====================================================================
-- 1. PRIMARY KEY TESTING
-- =====================================================================

-- TC-01 (Positive): Insert a new department with valid data
-- Expected: 1 row affected
INSERT INTO department (DepartmentID, DepartmentName)
VALUES (9001, 'Computer Science');

SELECT * FROM department WHERE DepartmentID = 9001;

-- TC-02 (Negative): Insert a department using an existing primary key
-- Expected: Error 1062 Duplicate entry '9001' for key 'department.PRIMARY'
INSERT INTO department (DepartmentID, DepartmentName)
VALUES (9001, 'Mathematics');


-- =====================================================================
-- 2. FOREIGN KEY AND RELATIONSHIP TESTING
-- =====================================================================

-- TC-03 (Positive): Insert a faculty member with a valid DepartmentID
-- Expected: 1 row affected
INSERT INTO faculty (FacultyID, DepartmentID, FirstName, LastName, Email,
                     Phone, OfficeLocation, Biography)
VALUES (9001, 9001, 'Jane', 'Doe', 'tc.jdoe@spc.edu',
        '727-555-0101', 'Bldg A, Room 101', 'Teaches introductory programming.');

SELECT * FROM faculty WHERE FacultyID = 9001;

-- TC-04 (Negative): Insert a faculty member with a DepartmentID that doesn't exist
-- Expected: Error 1452 Cannot add or update a child row: a foreign key constraint fails
INSERT INTO faculty (FacultyID, DepartmentID, FirstName, LastName, Email)
VALUES (9003, 99999, 'Sam', 'Lee', 'tc.slee@spc.edu');

-- TC-07 (Positive): Insert an office hour for an existing faculty member
-- Expected: 1 row affected
INSERT INTO officehour (OfficeHourID, FacultyID, DayOfWeek, StartTime, EndTime, Location)
VALUES (9001, 9001, 'Monday', '10:00:00', '12:00:00', 'Bldg A, Room 101');

SELECT * FROM officehour WHERE OfficeHourID = 9001;

-- TC-08 (Negative): Insert an office hour using an invalid FacultyID
-- Expected: Error 1452 Cannot add or update a child row: a foreign key constraint fails
INSERT INTO officehour (OfficeHourID, FacultyID, DayOfWeek, StartTime, EndTime)
VALUES (9002, 99999, 'Tuesday', '09:00:00', '10:00:00');

-- TC-09 (Positive): Insert a course with valid information
-- Expected: 1 row affected
INSERT INTO course (CourseID, CourseCode, CourseTitle, SourceSystem)
VALUES (9001, 'COP 1000', 'Introduction to Programming', 'PeopleSoft');

SELECT * FROM course WHERE CourseID = 9001;

-- TC-10 (Positive): Assign an existing course to an existing faculty member
-- Expected: 1 row affected
INSERT INTO facultycourse (FacultyID, CourseID, Term)
VALUES (9001, 9001, 'Fall 2026');

SELECT * FROM facultycourse WHERE FacultyID = 9001;

-- TC-15 (Negative): Assign the same course to the same faculty member again
-- Expected: Error 1062 Duplicate entry '9001-9001' for key 'facultycourse.PRIMARY'
INSERT INTO facultycourse (FacultyID, CourseID, Term)
VALUES (9001, 9001, 'Spring 2027');


-- =====================================================================
-- 3. CONSTRAINT TESTING
-- =====================================================================

-- TC-05 (Negative): Insert a faculty member without a FirstName (NOT NULL)
-- Expected: Error 1048 Column 'FirstName' cannot be null
INSERT INTO faculty (FacultyID, DepartmentID, FirstName, LastName, Email)
VALUES (9004, 9001, NULL, 'Smith', 'tc.smith@spc.edu');

-- TC-06 (Negative): Insert a faculty member with an email that already exists (UNIQUE)
-- Expected: Error 1062 Duplicate entry 'tc.jdoe@spc.edu' for key 'faculty.Email'
INSERT INTO faculty (FacultyID, DepartmentID, FirstName, LastName, Email)
VALUES (9005, 9001, 'John', 'Doe', 'tc.jdoe@spc.edu');

-- TC-13 (Negative): Insert an office hour with an invalid time value (data type)
-- Expected: Error 1292 Incorrect time value: 'abc' for column 'StartTime'
INSERT INTO officehour (OfficeHourID, FacultyID, DayOfWeek, StartTime, EndTime)
VALUES (9003, 9001, 'Wednesday', 'abc', '12:00:00');

-- TC-14 (Negative): Insert a FirstName longer than 50 characters (data type / length)
-- Expected: Error 1406 Data too long for column 'FirstName'
INSERT INTO faculty (FacultyID, DepartmentID, FirstName, LastName, Email)
VALUES (9006, 9001, REPEAT('A', 51), 'Long', 'tc.long@spc.edu');


-- =====================================================================
-- 4. CRUD OPERATION TESTING (UPDATE / DELETE)
-- =====================================================================

-- TC-11 (Positive): Update a faculty member's office location
-- Expected: 1 row affected; SELECT shows the new location
UPDATE faculty
SET OfficeLocation = 'Bldg B, Room 205'
WHERE FacultyID = 9001;

SELECT FacultyID, FirstName, LastName, OfficeLocation
FROM faculty WHERE FacultyID = 9001;

-- TC-18 (Negative): Update a faculty member's email to one that already exists
-- Setup: add a second faculty member (should succeed)
INSERT INTO faculty (FacultyID, DepartmentID, FirstName, LastName, Email)
VALUES (9002, 9001, 'Maria', 'Garcia', 'tc.mgarcia@spc.edu');

-- Expected: Error 1062 Duplicate entry 'tc.jdoe@spc.edu' for key 'faculty.Email'
UPDATE faculty
SET Email = 'tc.jdoe@spc.edu'
WHERE FacultyID = 9002;


-- =====================================================================
-- 5. BUSINESS RULE TESTING
-- =====================================================================

-- TC-17 (Positive): Course without SourceSystem defaults to 'PeopleSoft'
-- Expected: 1 row affected; SELECT shows SourceSystem = 'PeopleSoft'
INSERT INTO course (CourseID, CourseCode, CourseTitle)
VALUES (9002, 'COP 2800', 'Java Programming');

SELECT CourseID, CourseCode, SourceSystem FROM course WHERE CourseID = 9002;

-- TC-16 (Negative): Delete a department that still has faculty members
-- Expected: Error 1451 Cannot delete or update a parent row: a foreign key constraint fails
DELETE FROM department WHERE DepartmentID = 9001;

-- TC-12 (Positive): Delete a faculty member with office hours and course assignments
-- Before: confirm the child rows exist (should return 1 row each)
SELECT * FROM officehour    WHERE FacultyID = 9001;
SELECT * FROM facultycourse WHERE FacultyID = 9001;

-- Expected: 1 row affected
DELETE FROM faculty WHERE FacultyID = 9001;

-- After: both should return 0 rows, proving ON DELETE CASCADE worked
SELECT * FROM officehour    WHERE FacultyID = 9001;
SELECT * FROM facultycourse WHERE FacultyID = 9001;


-- =====================================================================
-- CLEANUP: remove all test data added by this script
-- =====================================================================
DELETE FROM faculty    WHERE FacultyID    IN (9001, 9002);
DELETE FROM course     WHERE CourseID     IN (9001, 9002);
DELETE FROM department WHERE DepartmentID = 9001;

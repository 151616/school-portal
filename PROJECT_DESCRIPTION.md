# KGrades Project Description

## What This App Is

KGrades is a role-based school portal for managing the day-to-day academic lifecycle of a school in one place. It is designed to connect administrators, teachers, students, and parents around a shared set of workflows:

- account onboarding and role assignment
- class and roster management
- grading and progress tracking
- attendance monitoring
- report card preparation and publishing
- parent visibility into student performance
- controlled internal messaging

At a product level, it sits between a lightweight student information system, a grading portal, and a parent communication tool.

## Core Problem It Solves

The app is built to replace fragmented school operations that are often spread across spreadsheets, informal chat threads, paper records, and disconnected portals.

Instead of having:

- admins managing enrollment manually
- teachers tracking grades in isolated tools
- students seeing only partial progress
- parents waiting until the end of term for updates

KGrades gives each role a focused dashboard tied to the same underlying academic records.

## Who Uses It

### Administrators

Administrators are the operational owners of the system. They can:

- create and manage invite-only access for new users
- assign or remove users across school roles
- create classes and assign teachers
- enroll students into classes individually or in bulk
- review and manage class rosters
- configure academic sessions and terms
- set school-wide grading weights
- generate or backfill parent access codes
- review report-card readiness and publish report cards
- export report cards as PDF or ZIP bundles
- monitor diagnostics and administrative activity

The admin role is effectively the control center for school setup and academic release processes.

### Teachers

Teachers use the system as their daily classroom workspace. They can:

- view their assigned classes
- create assignments and enter grades per student
- distinguish continuous assessment from exam work
- reuse grading templates across classes
- review student history within a class
- take attendance and track tardiness/excused absences
- monitor short-term attendance summaries
- write teacher comments for term report cards

For teachers, the system is built around routine instructional tasks rather than broad administration.

### Students

Students use the app as a live academic progress portal. They can:

- see their enrolled classes and assignment results
- track averages and grade bands
- review recent performance across subjects
- filter academic progress by session and term
- view trend lines across report cards
- open and download published report cards as PDFs
- copy a parent-link code to connect a parent account

The student experience is meant to provide ongoing visibility, not just end-of-term results.

### Parents

Parents use the app as a monitoring and engagement portal. They can:

- create an account using a student-issued parent code
- link multiple children to one parent account
- switch between linked children
- review grades by child, class, session, and term
- see assignment completion and missing work
- check recent attendance patterns
- view report-card trends and published report cards
- download report cards as PDFs

The parent experience is built around transparency and early awareness rather than passive end-of-term reporting.

## How Access Works

The app is intentionally not an open self-signup system for most users.

Its access model is:

1. administrators create invites for staff and students
2. invited users complete account setup through those invites
3. student accounts automatically receive a parent code
4. parents use that code to create or link their parent account

This keeps role assignment controlled by the school while still allowing parents to self-activate once a student exists in the system.

## Main Product Workflows

### 1. School Setup and User Provisioning

An administrator establishes the operational structure of the school by creating users, issuing invites, assigning roles, and organizing classes.

This includes:

- invite-based onboarding for students, teachers, and admins
- optional school scoping for administrative control
- automatic student ID generation where needed
- parent-code generation for student-family linking

### 2. Class and Roster Management

Once users exist, administrators can structure instructional delivery by:

- creating classes
- assigning a teacher to each class
- enrolling students one at a time or in bulk
- moving or removing students from rosters
- reviewing class membership and attendance summaries

This makes the class roster the operational bridge between academic records and the people using the system.

### 3. Grading and Assessment

Teachers record assessment data directly against students in their assigned classes.

The grading model supports:

- named assignments
- max-score based grading
- optional rubrics
- continuous-assessment vs exam-style entries
- per-student history
- reusable assignment templates

The app can then surface averages and performance summaries to students and parents in near real time.

### 4. Attendance Monitoring

Teachers can mark attendance by class and date using statuses such as:

- present
- tardy
- absent
- excused

Attendance becomes visible in different ways depending on role:

- teachers see class summaries and short-term patterns
- parents see recent attendance for their linked children
- absence events can trigger alerts

### 5. Report Card Preparation and Publishing

The app has a formal term-based reporting workflow.

Administrators define academic sessions and terms, teachers contribute term comments, principals/admins can add principal comments, and the system evaluates whether each class is ready for publication.

When report cards are published, the system assembles a term-level academic snapshot that includes:

- subject performance
- class position and class size
- attendance totals
- teacher comments
- principal comments
- next-term return date

Published report cards can then be previewed, downloaded individually, or exported in bulk.

### 6. Parent Engagement and Visibility

One of the strongest product ideas in the app is that parents are not treated as an afterthought.

The portal gives parents direct access to:

- linked-child academic records
- attendance history
- report card releases
- grade changes and alerts

This moves the product beyond internal school administration and into active family communication.

### 7. Controlled Messaging

The app includes a built-in messaging layer for school-appropriate communication.

Messaging is role-restricted rather than open-ended. It is intended for operationally appropriate conversations such as:

- teacher-to-student
- teacher-to-parent
- teacher-to-admin
- admin-to-student

The purpose is to support academic follow-up and communication without turning the app into a general social chat system.

## Important Product Behaviors

Several important behaviors happen automatically in the background:

- new student accounts receive parent-link codes
- invalid or duplicate invites are rejected
- grade updates can notify linked parents
- absence events can notify linked parents
- report cards are generated from existing grades, attendance, and comments
- parents can be linked to additional children after account creation

These automations make the portal more than a static record viewer. It behaves like an active academic workflow system.

## Information the App Organizes

At a business level, the app manages these categories of school information:

- user identities and roles
- student IDs
- class rosters and teacher assignments
- assignment scores and grading components
- attendance records
- academic sessions and term dates
- school grading-weight settings
- teacher and principal remarks
- report cards and report-card history
- parent-child relationships
- notifications
- internal message threads
- audit-oriented administrative actions

## Product Shape and Positioning

KGrades is best described as:

- a school operations portal
- a grading and progress-tracking system
- a parent visibility tool
- a controlled communication platform

It is not just a gradebook and not just a messaging app. Its value comes from tying academic records, reporting, and family visibility into one workflow.

## Best-Fit Use Case

The app is a good fit for schools that want:

- structured invite-only access rather than open registration
- clear separation of responsibilities by role
- continuous visibility into student progress
- parent engagement before final report-card release
- a lightweight but integrated administrative workflow

It is especially suited to schools that need something more operational than a simple grade tracker, but lighter than a large enterprise SIS.

## Short Reusable Summary

KGrades is a role-based school portal that helps administrators, teachers, students, and parents manage the full academic workflow of a school. It supports invite-based onboarding, class and roster management, grading, attendance, report-card publishing, parent-child account linking, notifications, and controlled internal messaging. The product is designed to give schools one shared system for academic operations while giving each role a focused view of the same underlying student records.

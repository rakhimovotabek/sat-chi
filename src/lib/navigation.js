// Shared route metadata keeps navigation, page titles, and placeholders aligned.
export const studentNavigation = [
  { slug: "dashboard", label: "Dashboard", icon: "dashboard" },
  {
    slug: "homework",
    label: "Homework",
    icon: "homework",
    description: "A dedicated place for your assignments and practice.",
    emptyTitle: "Your next assignment starts here",
    emptyDescription:
      "Assigned homework and submission details will appear here when homework is available.",
  },
  {
    slug: "books",
    label: "Books",
    icon: "books",
    description: "Build your understanding, one topic at a time.",
    emptyTitle: "Your learning library",
    emptyDescription:
      "SAT preparation books and their topics will be available in this space.",
  },
  {
    slug: "vocabulary",
    label: "Vocabulary",
    icon: "vocabulary",
    description: "Make room for new words and stronger reading skills.",
    emptyTitle: "Words worth learning",
    emptyDescription: "Vocabulary books and study sets will be organized here.",
  },
  {
    slug: "question-bank",
    label: "Question Bank",
    icon: "questions",
    description: "A space for focused SAT-style practice.",
    emptyTitle: "Practice with purpose",
    emptyDescription:
      "The question library and two-panel SAT practice experience will be added in a future phase.",
  },
  {
    slug: "standings",
    label: "Standings",
    icon: "standings",
    description: "Follow your achievements alongside your learning group.",
    emptyTitle: "Every step forward matters",
    emptyDescription:
      "Group standings will appear here when the platform can track learning activity.",
  },
  {
    slug: "profile",
    label: "Profile",
    icon: "profile",
    description: "Your personal space on SAT’chi.",
    emptyTitle: "Your student profile",
    emptyDescription:
      "You are signed in securely. Account preference editing will be added in a future phase.",
  },
];

export const adminNavigation = [
  { slug: "dashboard", label: "Admin Dashboard", icon: "dashboard" },
  {
    slug: "students",
    label: "Students",
    icon: "profile",
    description: "A central workspace for your students.",
    emptyTitle: "Student management",
    emptyDescription:
      "Student accounts and learning details will be managed here.",
  },
  {
    slug: "groups",
    label: "Groups",
    icon: "groups",
    description: "Organize learning around your classes and cohorts.",
    emptyTitle: "Bring students together",
    emptyDescription:
      "Group membership and class organization will be available here.",
  },
  {
    slug: "books",
    label: "Books",
    icon: "books",
    description: "Organize the platform’s SAT learning materials.",
    emptyTitle: "Build the learning library",
    emptyDescription:
      "Book and topic management will be added in a future phase.",
  },
  {
    slug: "homework",
    label: "Homework",
    icon: "homework",
    description: "Plan assignments for students and groups.",
    emptyTitle: "Make practice part of the plan",
    emptyDescription:
      "Homework creation and assignment tools will be added here.",
  },
  {
    slug: "vocabulary",
    label: "Vocabulary",
    icon: "vocabulary",
    description: "Organize vocabulary books and study sets.",
    emptyTitle: "Vocabulary management",
    emptyDescription:
      "Tools for maintaining vocabulary materials will be available here.",
  },
  {
    slug: "results",
    label: "Results",
    icon: "results",
    description: "A future view into student learning and performance.",
    emptyTitle: "Understand the learning journey",
    emptyDescription:
      "Results, progress, time tracking, and admin analytics will appear here when tracking is implemented.",
  },
];

studentNavigation.splice(
  studentNavigation.findIndex((p) => p.slug === "standings"),
  0,
  {
    slug: "progress",
    label: "Progress",
    icon: "results",
    description: "Follow your learning journey.",
    emptyTitle: "Your progress starts with practice",
    emptyDescription:
      "Your learning activity will appear here when practice becomes available.",
  },
);
const vocabulary = studentNavigation.splice(
  studentNavigation.findIndex((p) => p.slug === "vocabulary"),
  1,
)[0];
studentNavigation.splice(
  studentNavigation.findIndex((p) => p.slug === "question-bank") + 1,
  0,
  vocabulary,
);
adminNavigation[0].label = "Dashboard";
adminNavigation.find((p) => p.slug === "results").label = "Results / Analytics";
adminNavigation.splice(
  adminNavigation.findIndex((p) => p.slug === "homework"),
  0,
  {
    slug: "question-bank",
    label: "Question Bank",
    icon: "questions",
    emptyTitle: "Question bank management",
    emptyDescription:
      "Question bank tools will be available in a future phase.",
  },
);
adminNavigation.push({
  slug: "settings",
  label: "Settings",
  icon: "profile",
  emptyTitle: "Platform settings",
  emptyDescription: "Platform configuration tools will be available here.",
});

studentNavigation.splice(2, 0, {
  slug: "study-plan",
  label: "Study Plan",
  icon: "homework",
});

adminNavigation.splice(
  adminNavigation.findIndex((p) => p.slug === "settings"),
  0,
  { slug: "content-review", label: "Content Review", icon: "books" },
);

studentNavigation.push({
  slug: "settings",
  label: "Settings",
  icon: "profile",
});

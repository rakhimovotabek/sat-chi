import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";
import StudentLayout from "./layouts/StudentLayout.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
const StudentDashboard = lazy(() => import("./pages/student/Dashboard.jsx"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
import PlaceholderPage from "./pages/PlaceholderPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import { adminNavigation, studentNavigation } from "./lib/navigation.js";
import RequireAuth, { AuthLoading } from "./auth/RequireAuth.jsx";
const Login = lazy(() => import("./pages/auth/Login.jsx"));
const Signup = lazy(() => import("./pages/auth/Signup.jsx"));
const Onboarding = lazy(() => import("./pages/auth/Onboarding.jsx"));
const AuthCallback = lazy(() => import("./pages/auth/AuthCallback.jsx"));
const Landing = lazy(() => import("./pages/Landing.jsx"));
const Students = lazy(() => import("./pages/admin/Students.jsx"));
const Books = lazy(() => import("./features/books/Books.jsx"));
const BookDetail = lazy(() => import("./features/books/BookDetail.jsx"));
const Questions = lazy(() => import("./features/books/Questions.jsx"));
const Player = lazy(() => import("./features/player/Player.jsx"));
function LegacyStudent() {
  const params = useParams();
  return <Navigate to={`/${params["*"] || "dashboard"}`} replace />;
}
export default function App() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          element={
            <RequireAuth roles={["student"]} allowIncompleteOnboarding />
          }
        >
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/student/*" element={<LegacyStudent />} />
          <Route element={<StudentLayout />}>
            <Route path="/dashboard" element={<StudentDashboard />} />
            <Route path="/profile" element={<Onboarding editing />} />
            <Route path="/books" element={<Books />} />
            <Route path="/books/:bookId" element={<BookDetail />} />
            <Route
              path="/books/:bookId/topics/:topicId"
              element={<BookDetail />}
            />
            <Route path="/practice/:sessionId" element={<Player />} />
            {studentNavigation
              .filter(
                (p) => !["dashboard", "profile", "books"].includes(p.slug),
              )
              .map((p) => (
                <Route
                  key={p.slug}
                  path={`/${p.slug}`}
                  element={<PlaceholderPage page={p} />}
                />
              ))}
          </Route>
          <Route element={<RequireAuth roles={["admin"]} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="students" element={<Students />} />
              <Route path="books" element={<Books admin />} />
              <Route path="books/:bookId" element={<BookDetail admin />} />
              <Route path="questions" element={<Questions />} />
              {adminNavigation
                .filter(
                  (p) =>
                    !["dashboard", "students", "books", "questions"].includes(
                      p.slug,
                    ),
                )
                .map((p) => (
                  <Route
                    key={p.slug}
                    path={p.slug}
                    element={<PlaceholderPage page={p} />}
                  />
                ))}
              <Route
                path="*"
                element={<NotFoundPage home="/admin/dashboard" />}
              />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage home="/" standalone />} />
      </Routes>
    </Suspense>
  );
}

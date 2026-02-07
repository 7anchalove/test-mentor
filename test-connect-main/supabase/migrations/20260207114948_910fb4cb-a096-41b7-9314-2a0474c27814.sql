
-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.app_role AS ENUM ('student', 'teacher');
CREATE TYPE public.test_category AS ENUM ('ITA_L2', 'TOLC', 'CENTS', 'CLA');
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- ============================================
-- PROFILES TABLE (public user info)
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'student',
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- USER_ROLES TABLE (for secure role checks)
-- ============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own role"
  ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================
-- TEACHER_PROFILES TABLE
-- ============================================
CREATE TABLE public.teacher_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  headline TEXT,
  subjects TEXT[],
  hourly_rate NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_teacher_profiles_user_id ON public.teacher_profiles(user_id);

ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active teacher profiles"
  ON public.teacher_profiles FOR SELECT
  USING (true);

CREATE POLICY "Teachers can insert own profile"
  ON public.teacher_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers can update own profile"
  ON public.teacher_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- TESTS TABLE (supported test types)
-- ============================================
CREATE TABLE public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.test_category NOT NULL,
  subtype TEXT,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(category, subtype)
);

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tests"
  ON public.tests FOR SELECT
  USING (true);

-- Pre-seed test types
INSERT INTO public.tests (category, subtype, display_name) VALUES
  ('ITA_L2', NULL, 'ITA L2'),
  ('CENTS', NULL, 'CENT''S'),
  ('CLA', NULL, 'CLA'),
  ('TOLC', 'I', 'TOLC-I'),
  ('TOLC', 'E', 'TOLC-E'),
  ('TOLC', 'F', 'TOLC-F'),
  ('TOLC', 'SU', 'TOLC-SU'),
  ('TOLC', 'B', 'TOLC-B'),
  ('TOLC', 'S', 'TOLC-S');

-- ============================================
-- STUDENT_TEST_SELECTIONS TABLE
-- ============================================
CREATE TABLE public.student_test_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  test_category public.test_category NOT NULL,
  test_subtype TEXT,
  test_date_time TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_selections_student ON public.student_test_selections(student_id);

ALTER TABLE public.student_test_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own selections"
  ON public.student_test_selections FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can create own selections"
  ON public.student_test_selections FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update own selections"
  ON public.student_test_selections FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view all selections for bookings"
  ON public.student_test_selections FOR SELECT
  USING (public.has_role(auth.uid(), 'teacher'));

-- ============================================
-- TEACHER_AVAILABILITY_RULES TABLE
-- ============================================
CREATE TABLE public.teacher_availability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Tunis',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_availability_teacher ON public.teacher_availability_rules(teacher_id);

ALTER TABLE public.teacher_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view availability rules"
  ON public.teacher_availability_rules FOR SELECT
  USING (true);

CREATE POLICY "Teachers can manage own availability"
  ON public.teacher_availability_rules FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own availability"
  ON public.teacher_availability_rules FOR UPDATE
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own availability"
  ON public.teacher_availability_rules FOR DELETE
  USING (auth.uid() = teacher_id);

-- ============================================
-- TEACHER_UNAVAILABLE_DATES TABLE
-- ============================================
CREATE TABLE public.teacher_unavailable_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  start_date_time TIMESTAMPTZ NOT NULL,
  end_date_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_unavailable_teacher ON public.teacher_unavailable_dates(teacher_id);

ALTER TABLE public.teacher_unavailable_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view unavailable dates"
  ON public.teacher_unavailable_dates FOR SELECT
  USING (true);

CREATE POLICY "Teachers can manage own unavailable dates"
  ON public.teacher_unavailable_dates FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own unavailable dates"
  ON public.teacher_unavailable_dates FOR UPDATE
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own unavailable dates"
  ON public.teacher_unavailable_dates FOR DELETE
  USING (auth.uid() = teacher_id);

-- ============================================
-- BOOKINGS TABLE
-- ============================================
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  student_test_selection_id UUID REFERENCES public.student_test_selections(id) ON DELETE CASCADE NOT NULL,
  start_date_time TIMESTAMPTZ NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bookings_student ON public.bookings(student_id);
CREATE INDEX idx_bookings_teacher ON public.bookings(teacher_id);
CREATE UNIQUE INDEX idx_bookings_unique_selection ON public.bookings(student_test_selection_id) WHERE status != 'cancelled';

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Students can create bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Booking parties can update"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = student_id OR auth.uid() = teacher_id);

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_student ON public.conversations(student_id);
CREATE INDEX idx_conversations_teacher ON public.conversations(teacher_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = student_id OR auth.uid() = teacher_id);

CREATE POLICY "Students can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Security definer function to check conversation membership
CREATE OR REPLACE FUNCTION public.is_conversation_member(_user_id UUID, _conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conversation_id
    AND (student_id = _user_id OR teacher_id = _user_id)
  )
$$;

CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT
  USING (public.is_conversation_member(auth.uid(), conversation_id));

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_member(auth.uid(), conversation_id)
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teacher_profiles_updated_at BEFORE UPDATE ON public.teacher_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_student_selections_updated_at BEFORE UPDATE ON public.student_test_selections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_availability_rules_updated_at BEFORE UPDATE ON public.teacher_availability_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- PROFILE AUTO-CREATE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student')
  );
  
  -- If teacher, also create teacher_profile
  IF COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student') = 'teacher' THEN
    INSERT INTO public.teacher_profiles (user_id, headline, subjects)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'headline',
      CASE WHEN NEW.raw_user_meta_data->>'subjects' IS NOT NULL
        THEN ARRAY(SELECT jsonb_array_elements_text((NEW.raw_user_meta_data->>'subjects')::jsonb))
        ELSE ARRAY[]::TEXT[]
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

export interface ExperienceEntry {
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  companyLogo: string | null;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  description: string | null;
}

export interface EducationEntry {
  school: string | null;
  schoolUrl: string | null;
  schoolLogo: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  grade: string | null;
  activities: string | null;
  description: string | null;
}

export interface CertificationEntry {
  name: string | null;
  authority: string | null;
  licenseNumber: string | null;
  url: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
}

export interface VolunteerEntry {
  role: string | null;
  company: string | null;
  companyUrl: string | null;
  companyLogo: string | null;
  cause: string | null;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  description: string | null;
}

export interface HonorEntry {
  title: string | null;
  issuer: string | null;
  issuedOn: string | null;
  description: string | null;
}

export interface PublicationEntry {
  name: string | null;
  publisher: string | null;
  publishedOn: string | null;
  url: string | null;
  description: string | null;
  authors: { name: string; profileUrl: string | null }[];
}

export interface Profile {
  publicId: string | null;
  profileUrl: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  headline: string | null;
  location: string | null;
  countryCode: string | null;
  industry: string | null;
  about: string | null;
  pronouns: string | null;
  images: { profilePicture: string | null; backgroundImage: string | null };
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  certifications: CertificationEntry[];
  languages: { name: string | null; proficiency: string | null }[];
  featured: { title: string | null; url: string | null; provider: string | null }[];
  volunteerExperience: VolunteerEntry[];
  honors: HonorEntry[];
  publications: PublicationEntry[];
}

export interface ProfileEnvelope {
  profile: Profile;
  meta: {
    fetchedAt: string;
    cached: boolean;
    source: string;
    partial?: {
      skills?: { returned: number; total: number };
      experience?: { returnedGroups: number; totalGroups: number };
      featured?: { returned: number; total: number };
      volunteerExperience?: { returned: number; total: number };
      honors?: { returned: number; total: number };
      publications?: { returned: number; total: number };
    };
  };
}

export interface ApiError {
  error: { code: string; message: string };
}

/** The unprocessed Voyager payload. */
export interface RawPayload {
  data: unknown;
  included: { $type?: string; entityUrn?: string; [k: string]: unknown }[];
}

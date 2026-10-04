// Pages for one learner share the Sprout header. The garden fills the screen; the rest sit in a column.
import SiteHeader from '@/components/SiteHeader';

export default async function LearnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <>
      <SiteHeader userId={userId} />
      {children}
    </>
  );
}

import { notFound } from "next/navigation";
import { COMMISSIONERS } from "@/lib/constants";
import { MEETINGS } from "@/lib/seed-data";
import CategoryTag from "@/components/CategoryTag";

function getCommissionerName(id: string) {
  return COMMISSIONERS.find((c) => c.id === id)?.name ?? id;
}

function getCommissionerColor(id: string) {
  return COMMISSIONERS.find((c) => c.id === id)?.color ?? "#888";
}

export default async function MeetingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = MEETINGS.find((m) => m.id === id);
  if (!meeting) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-3xl font-bold text-forest">
          {new Date(meeting.date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h1>
        <p className="text-ink-light mt-1 capitalize">
          {meeting.type} meeting · {meeting.time} · {meeting.duration} · ~{meeting.audienceSize} audience
        </p>
        <div className="flex gap-2 mt-2">
          {meeting.attendees.map((id) => (
            <span
              key={id}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: getCommissionerColor(id) }}
            >
              {getCommissionerName(id)}
            </span>
          ))}
        </div>
      </div>

      {/* TLDR */}
      <div className="bg-white rounded-xl shadow-sm border border-parchment-dark p-6">
        <h2 className="font-heading text-lg font-bold text-forest mb-2">Summary</h2>
        <p className="text-sm leading-relaxed">{meeting.tldr}</p>
      </div>

      {/* Key Votes */}
      <section>
        <h2 className="font-heading text-2xl font-bold text-forest mb-4">Key Votes</h2>
        <div className="space-y-3">
          {meeting.keyVotes.map((vote, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-parchment-dark p-5">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium">{vote.description}</p>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800 whitespace-nowrap">
                  {vote.result}
                </span>
              </div>
              <p className="text-sm text-ink-light mt-2">
                {vote.mover === "consent agenda" ? (
                  "Consent Agenda"
                ) : (
                  <>
                    Moved by <span className="font-medium text-ink">{getCommissionerName(vote.mover)}</span>
                    {" · "}
                    Seconded by <span className="font-medium text-ink">{getCommissionerName(vote.seconder)}</span>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Commissioner Activity */}
      <section>
        <h2 className="font-heading text-2xl font-bold text-forest mb-4">Commissioner Activity</h2>
        <div className="space-y-4">
          {Object.entries(meeting.commissionerActivity).map(([commId, activity]) => (
            <div key={commId} className="bg-white rounded-xl shadow-sm border border-parchment-dark overflow-hidden">
              <div className="h-1" style={{ backgroundColor: getCommissionerColor(commId) }} />
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading font-bold text-lg">{getCommissionerName(commId)}</h3>
                  <div className="flex gap-3 text-xs text-ink-light">
                    <span>{activity.motionsMade} motions made</span>
                    <span>{activity.motionsSeconded} seconded</span>
                    {activity.externalRoles.length > 0 && (
                      <span className="text-gold font-medium">{activity.externalRoles.join(", ")}</span>
                    )}
                  </div>
                </div>
                <ul className="space-y-2">
                  {activity.topics.map((topic, i) => (
                    <li key={i} className="flex flex-col gap-1">
                      <p className="text-sm">{topic.text}</p>
                      <div className="flex flex-wrap gap-1">
                        {topic.categories.map((catId) => (
                          <CategoryTag key={catId} id={catId} />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Public Comments */}
      <section>
        <h2 className="font-heading text-2xl font-bold text-forest mb-4">Public Comments</h2>
        <div className="space-y-3">
          {meeting.publicComments.map((comment, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-parchment-dark p-5">
              <h3 className="font-semibold">{comment.speaker}</h3>
              <p className="text-sm text-ink-light mt-1">{comment.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

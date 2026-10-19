/* Slot-filled example frames that were copied into words.js and then into exam-tracks.js.
 * build-exam-tracks.js rejects any card that still matches one of these.
 */
"use strict";

const FAMILIES = [
  { id: "adj-day", label: "That was a(n) WORD day at school.", re: /^That was an? .+ day at school\.?$/i },
  { id: "discussed", label: "The class discussed WORD this morning.", re: /^The class discussed .+ this morning\.?$/i },
  { id: "found-passage", label: "He found WORD in the reading passage.", re: /^He found .+ in the reading passage\.?$/i },
  { id: "explained-picture", label: "The teacher explained WORD with a picture.", re: /^The teacher explained .+ with a picture\.?$/i },
  { id: "talked-about", label: "We talked about WORD in class today.", re: /^We talked about .+ in class today\.?$/i },
  { id: "homework-about", label: "Our homework today is about WORD.", re: /^Our homework today is about .+\.?$/i },
  { id: "note-about", label: "I wrote a note about WORD.", re: /^I wrote a note about .+\.?$/i },
  { id: "question-about", label: "She asked a question about WORD.", re: /^She asked a question about .+\.?$/i },
  { id: "video-about", label: "We watched a short video about WORD.", re: /^We watched a short video about .+\.?$/i },
  { id: "learned-to", label: "We learned to WORD in today's lesson.", re: /^We learned to .+ in today's lesson\.?$/i },
  { id: "plan-for-trip", label: "We need a(n) WORD plan for the trip.", re: /^We need an? .+ plan for the trip\.?$/i },
  { id: "hopes-to", label: "He hopes to WORD next week.", re: /^He hopes to .+ next week\.?$/i },
  { id: "please-quietly", label: "Please WORD quietly.", re: /^Please .+ quietly\.?$/i },
  { id: "wants-after-class", label: "She wants to WORD after class.", re: /^She wants to .+ after class\.?$/i },
  { id: "need-before-dinner", label: "I need to WORD before dinner.", re: /^I need to .+ before dinner\.?$/i },
  { id: "every-friday", label: "They WORD every Friday.", re: /^They .+ every Friday\.?$/i },
  { id: "tomorrow-morning", label: "We will WORD tomorrow morning.", re: /^We will .+ tomorrow morning\.?$/i },
  { id: "example-in-book", label: "This is a(n) WORD example in our book.", re: /^This is an? .+ example in our book\.?$/i },
  { id: "told-story", label: "He told a(n) WORD story after lunch.", re: /^He told an? .+ story after lunch\.?$/i },
  { id: "students-together", label: "The students WORD together in class.", re: /^The students .+ together in class\.?$/i },
  { id: "gave-answer", label: "She gave a(n) WORD answer in class.", re: /^She gave an? .+ answer in class\.?$/i },
  { id: "there-are-students", label: "There are WORD students in the classroom.", re: /^There are .+ students in the classroom\.?$/i },
  { id: "read-article", label: "I read a(n) WORD article last night.", re: /^I read an? .+ article last night\.?$/i },
  { id: "lesson-today", label: "This is the WORD lesson today.", re: /^This is the .+ lesson today\.?$/i },
  { id: "bag-chair", label: "Put your bag WORD the chair.", re: /^Put your bag .+ the chair\.?$/i },
  { id: "finished-work", label: "They finished the work WORD.", re: /^They finished the work .+\.?$/i },
  { id: "she-answered", label: "She answered WORD.", re: /^She answered \S+\.?$/i },
  { id: "speak-in-class", label: "Please speak WORD in class.", re: /^Please speak .+ in class\.?$/i },
  { id: "walked-to-school", label: "He walked WORD to school.", re: /^He walked .+ to school\.?$/i },
  { id: "teacher-coming", label: "WORD! The teacher is coming.", re: /The teacher is coming\.?$/i },
  { id: "tired-kept", label: "I was tired, WORD I kept studying.", re: /^I was tired, .+ I kept studying\.?$/i },
  { id: "spoke-in-front", label: "She spoke WORD in front of the class.", re: /^She spoke .+ in front of the class\.?$/i },
  { id: "whatever-worksheet", label: "Whatever students finished the worksheet.", re: /^Whatever students finished the worksheet\.?$/i },
];

function templateFamily(example) {
  const text = String(example || "").trim();
  for (const family of FAMILIES) {
    if (family.re.test(text)) return family;
  }
  return null;
}

function isTemplateExample(example) {
  return !!templateFamily(example);
}

module.exports = { FAMILIES, templateFamily, isTemplateExample };

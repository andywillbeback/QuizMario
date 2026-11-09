/* Empty 雅思 track. The reviewed word list is not in this file.
 * Practice keys are ielts|group::word once words exist. Loading this file
 * does not read or rewrite a student save.
 */
(function (root) {
  "use strict";
  var track = {
    id: "ielts",
    name: "雅思",
    desc: "雅思词库尚未装入。词表到位前没有可练的词。拼写与中考相同，是键入英文。",
    sets: [],
    titles: [],
  };
  var exams = root.VOCAB_EXAM_TRACKS || (root.VOCAB_EXAM_TRACKS = []);
  if (!exams.some(function (item) { return item && item.id === "ielts"; })) exams.push(track);
  var tracks = root.VOCAB_TRACKS || (root.VOCAB_TRACKS = []);
  if (!tracks.some(function (item) { return item && item.id === "ielts"; })) {
    var at = -1;
    for (var i = 0; i < tracks.length; i++) if (tracks[i] && tracks[i].id === "gaokao") at = i;
    tracks.splice(at + 1, 0, track);
  }
})(typeof window !== "undefined" ? window : globalThis);

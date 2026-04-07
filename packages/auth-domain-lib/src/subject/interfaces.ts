export interface SubjectId {
  format: string;
  id: string;
}

export interface Subject {
  sub_ids: SubjectId[];
}

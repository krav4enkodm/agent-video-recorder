export interface Project {
  id: number
  name: string
  template: string
  owner: string
  archived: boolean
  isNew?: boolean
}

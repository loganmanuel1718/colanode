export class HeardMappingConflict extends Error {
  constructor() {
    super(
      'Heard identity mapping conflicts with an existing account or workspace'
    );
  }
}

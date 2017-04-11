import path from "path";
import _ from "lodash";
import writePkg from "write-pkg";
import writeJsonFile from "write-json-file";
import isValid from "is-valid-path";
import FileSystemUtilities from "../FileSystemUtilities";
import GitUtilities from "../GitUtilities";
import PromptUtilities from "../PromptUtilities";
import Command from "../Command";

export default class InitCommand extends Command {
  // don't do any of this.
  runValidations() {}
  runPreparations() {}

  initialize(callback) {
    if (!GitUtilities.isInitialized(this.execOpts)) {
      this.logger.info("Initializing Git repository.");
      GitUtilities.init(this.execOpts);
    }

    this.exact = this.getOptions().exact;

    callback(null, true);
  }

  execute(callback) {
    this.ensurePackageLocation((err, filePath) => {
      if (err) {
        callback(err);
        return;
      }

      if (!FileSystemUtilities.existsSync(filePath)) {
        this.logger.info(`Creating package directory in ${filePath}/.`);
        FileSystemUtilities.mkdirSync(filePath);
      }

      this.repository.packageLocation = filePath;

      this.ensurePackageJSON();
      this.ensureLernaJson();
      this.ensureNoVersionFile();
      this.logger.success("Successfully initialized Lerna files");
      callback(null, true);
    });
  }

  ensurePackageLocation(callback) {
    const { packageLocation } = this.repository.lernaJson;

    if (packageLocation) return callback(null, packageLocation);

    PromptUtilities.input("Location of packages?", {
      default: ".",
      validate: (path) => isValid(path) ? true : "Please enter a valid file path."
    }, (filePath) => {
      callback(null, path.join(filePath, "packages"));
    });
  }

  ensurePackageJSON() {
    let packageJson = this.repository.packageJson;

    if (!packageJson) {
      packageJson = {};
      this.logger.info("Creating package.json.");
    } else {
      this.logger.info("Updating package.json.");
    }

    let targetDependencies;
    if (packageJson.dependencies && packageJson.dependencies.lerna) {
      // lerna is a dependency in the current project
      targetDependencies = packageJson.dependencies;
    } else {
      // lerna is a devDependency or no dependency, yet
      if (!packageJson.devDependencies) packageJson.devDependencies = {};
      targetDependencies = packageJson.devDependencies;
    }

    targetDependencies.lerna = this.exact
      ? this.lernaVersion
      : `^${this.lernaVersion}`;

    writePkg.sync(this.repository.packageJsonLocation, packageJson);
  }

  ensureLernaJson() {
    // lernaJson already defaulted to empty object in Repository constructor
    const lernaJson = this.repository.lernaJson;

    let version;

    if (this.flags.independent) {
      version = "independent";
    } else if (FileSystemUtilities.existsSync(this.repository.versionLocation)) {
      version = FileSystemUtilities.readFileSync(this.repository.versionLocation);
    } else if (this.repository.version) {
      version = this.repository.version;
    } else {
      version = "0.0.0";
    }

    if (!this.repository.initVersion) {
      this.logger.info("Creating lerna.json.");
    } else {
      this.logger.info("Updating lerna.json.");
    }

    Object.assign(lernaJson, {
      lerna: this.lernaVersion,
      packages: this.repository.packageConfigs,
      version: version,
      packageLocation: this.repository.packageLocation
    });

    if (this.exact) {
      // ensure --exact is preserved for future init commands
      const configKey = lernaJson.commands ? "commands" : "command";
      _.set(lernaJson, `${configKey}.init.exact`, true);
    }

    writeJsonFile.sync(this.repository.lernaJsonLocation, lernaJson, { indent: 2 });
  }

  ensureNoVersionFile() {
    const versionLocation = this.repository.versionLocation;
    if (FileSystemUtilities.existsSync(versionLocation)) {
      this.logger.info("Removing old VERSION file.");
      FileSystemUtilities.unlinkSync(versionLocation);
    }
  }
}

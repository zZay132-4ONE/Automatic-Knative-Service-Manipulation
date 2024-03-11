/**
 * A VS Code extension helps developers automatically manipulate Knative services on the Kubernetes cluster efficiently 
 * (e.g., deploying Knative services, retrieving details about Knative Services, deleting Knative services).
 * 
 * It currently supports the following commands:
 * 	- aksm.deployKnService: Deploy a Knative service to the Kubernetes cluster (specified by the input "registry name" and "image name").
 *  - aksm.describeKnService: Print detailed information about a Knative service (specified by the input "service name").
 *  - aksm.listKnServices: Print detailed information about all Knative services.
 *  - aksm.deleteKnService: Delete a Knative Service (specified by the input "service name").
 *  - aksm.testExtension: Test whether the extension is working properly.
 * 
 * @author Dongzhi Zhang
 */

import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as util from 'util';
import * as fs from 'fs';

const EXTENSION_NAME = "automatic-knative-service-manipulation";
const OUTPUT_CHANNEL_NAME = "Automatic Knative Service Manipulation - Logs";

const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
const exec = util.promisify(childProcess.exec);

/**
 * This function is called when the extension is activated, responsible for registering commands.
 * 
 * @param {vscode.ExtensionContext} context - The context where the extension is executed.
 */
export function activate(context: vscode.ExtensionContext) {
	printLogInfo(`Extension "${EXTENSION_NAME}" is activated.\n`);

	// Command for deploying a Knative service to Kubernetes cluster
	let cmdDeployService = vscode.commands.registerCommand(`${EXTENSION_NAME}.deployKnService`, callDeployKnService);

	// Command for printing detailed information about a specified Knative service
	let cmdDescribeService = vscode.commands.registerCommand(`${EXTENSION_NAME}.describeKnService`, callDescribeKnService);

	// Command for printing detailed information about all Knative services
	let cmdDescribeAllServices = vscode.commands.registerCommand(`${EXTENSION_NAME}.listKnServices`, callListKnServices);

	// Command for deleting a specified Knative service from the Kubernetes cluster
	let cmdDeleteService = vscode.commands.registerCommand(`${EXTENSION_NAME}.deleteKnService`, callDeleteKnativeService);

	// Command for testing if the extension is activated and working properly
	let cmdTestExtension = vscode.commands.registerCommand(`${EXTENSION_NAME}.testExtension`, callTestExtension);

	context.subscriptions.push(cmdTestExtension, cmdDeployService, cmdDescribeService, cmdDescribeAllServices, cmdDeleteService);
}

/**
 * This function is called when the extension is deactivated.
 */
export function deactivate() { }

/* ========================= Command: aksm.deployKnService ==========================*/

/**
 * This function is invoked when command "aksm.deployKnService" is executed.
 */
async function callDeployKnService() {
	vscode.window.showInformationMessage(`Start deploying the Knative service to Kubernetes cluster.`);
	const registryName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Docker image registry",
		placeHolder: "docker.io/username"
	});
	const imageName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Docker image",
		placeHolder: `${EXTENSION_NAME}`
	});
	if (!registryName || !imageName) {
		vscode.window.showErrorMessage("Deployment terminated: valid registry and image name must be provided.");
		return;
	}
	deployKnService(registryName, imageName);
}

/**
 * This function automates the process of deploying a Knative service to Kubernetes:
 * 	(Steps 1~3 can be substituted with Buildpack for non Apple-Silicon-chip users)
 * 	(1) Create the Dockerfile. 
 * 	(2) Build the Docker image based on the Dockerfile.
 * 	(3) Push the built Docker image to the registry.
 * 	(4) Deploy the Knative service to the Kubernetes cluster.
 * 
 * @param registryName Name of the Docker image registry.
 * @param imageName Name of the Docker image.
 */
async function deployKnService(registryName: string, imageName: string) {
	// Should not continue to deploy if no valid folder is opened.
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage("No valid folder is opened.");
		return;
	}

	const workSpaceFolderPath = workspaceFolders[0].uri.fsPath;
	const dockerImageUri = `${registryName}/${imageName}`;
	const os = require('os');
	if (os.arch() === "arm64") {
		// Create the Dockerfile, build the Docker image, and push the image to the registry
		await createDockerfile(workSpaceFolderPath);
		const buildImageSuccess = await buildDockerImage(dockerImageUri, workSpaceFolderPath);
		if (!buildImageSuccess) {
			return;
		}
		// const pushImageSuccess = await pushDockerImage(dockerImageUri);
		// if (!pushImageSuccess) {
			// return;
		// }
	} else {
		// For non Apple-Silicon-chip users, the create-build-push process belwo can be substituted
		const sourceCodePath = "./";
		automateImageBuildAndPush(dockerImageUri, sourceCodePath); 
	}

	// Create the Knative service and deploy it to Kubernetes cluster 
	const knServiceName = `${imageName}-service`;
	const createKnServiceSuccess = await createKnService(knServiceName, dockerImageUri);
	if (!createKnServiceSuccess) {
		return;
	}
	printLogInfo(`Knative service "${knServiceName}" is deployed.`);
	printLogInfo(`You can use command "aksm.describeKnService" or "aksm.listKnServices" to check its details.\n`);
}

/**
 * Automate the building and pushing of the Docker image using Buildpack.
 * 
 * @param dockerImageUri URI of the docker image to be built.
 * @param sourceCodePath Path of the source codes.
 * @returns {Promise<boolean>}  Whether successfully built and pushed the Docker image.
 */
async function automateImageBuildAndPush(dockerImageUri: string, sourceCodePath: string): Promise<boolean> {
	const builderName = "paketobuildpacks/builder";
	const automateBuildImageCmd = `pack build ${dockerImageUri} --builder ${builderName} --path ${sourceCodePath}`;
	vscode.window.showInformationMessage(`Building and pushing the Docker image "${dockerImageUri}".`);
	printLogInfo(`Start building and pushing the Docker image "${dockerImageUri}".`);
	try {
		const { stdout, stderr } = await exec(automateBuildImageCmd);
		vscode.window.showInformationMessage(`Succcessfully built and pushed the Docker image "${dockerImageUri}".`);
		printLogInfo(`Successfully built and pushed the Docker image "${dockerImageUri}".\n`);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to build and push the Docker image "${dockerImageUri}".`);
		printLogInfo(`Failed to build and push the Docker image "${dockerImageUri}".`);
		console.error(error);
		return false;
	}
}

/**
 * Create the Dockerfile needed.
 * 
 * @param workSpaceFolderPath Path of the directory where the Dockerfile should reside.
 */
async function createDockerfile(workSpaceFolderPath: string) {
	const dockerFilePath = `${workSpaceFolderPath}/Dockerfile`;
	vscode.window.showInformationMessage(`Creating the Dockerfile.`);
	printLogInfo("Start creating the Dockerfile.");
	const DOCKERFILE_CONTENT =
		`FROM python:3.8-slim
COPY . /app
WORKDIR /app
RUN pip3 install --upgrade pip
RUN pip3 install -r requirements.txt 
EXPOSE 5000
CMD ["python3", "app.py"]`;
	fs.writeFileSync(dockerFilePath, DOCKERFILE_CONTENT);
	vscode.window.showInformationMessage(`Succcessfully created the Dockerfile.`);
	printLogInfo("Successfully created the Dockerfile.\n");
}

/**
 * Build the docker image based on the specified Dockerfile.
 * 
 * @param dockerImageUri URI of the docker image to be built.
 * @param contextDir Directory where the Dockerfile resides.
 * @returns {Promise<boolean>} Whether successfully built the Docker image. 
 */
async function buildDockerImage(dockerImageUri: string, contextDir: string): Promise<boolean> {
	const buildImageCmd = `docker build -t ${dockerImageUri} .`;
	vscode.window.showInformationMessage(`Building the Docker image "${dockerImageUri}".`);
	printLogInfo("Start building the Docker image.");
	try {
		const { stdout, stderr } = await exec(buildImageCmd, { cwd: contextDir });
		vscode.window.showInformationMessage(`Succcessfully built the Docker image "${dockerImageUri}".`);
		printLogInfo(`Successfully built the Docker image "${dockerImageUri}".\n`);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to build the Docker image "${dockerImageUri}".`);
		printLogInfo(`Failed to build the Docker image "${dockerImageUri}".`);
		console.error(error);
		return false;
	}
}

/**
 * Push the Docker image to the registry. 
 * 
 * @param dockerImageUri URI of the docker image to be built.
 * @returns {Promise<boolean>} Whether successfully pushed the Docker image. 
 */
async function pushDockerImage(dockerImageUri: string): Promise<boolean> {
	const pushImageCmd = `docker push ${dockerImageUri}`;
	vscode.window.showInformationMessage(`Pushing the Docker image.`);
	printLogInfo("Start pushing the Docker image.");
	try {
		const { stdout, stderr } = await exec(pushImageCmd);
		vscode.window.showInformationMessage(`Succcessfully pushed the Docker image "${dockerImageUri}".`);
		printLogInfo(`Successfully pushed the Docker image "${dockerImageUri}".\n`);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to push the Docker image "${dockerImageUri}".`);
		printLogInfo(`Failed to push the Docker image "${dockerImageUri}".\n`);
		console.error(error);
		return false;
	}
}

/**
 * Create the Knative service and deploy it to the Kubernetes cluster.
 * 
 * @param kantiveServiceName Name of the Knative service.
 * @param dockerImageUri URI of the docker image to be built.
 * @returns {Promise<boolean>} Whether successfully creating and deploying the Knative service. 
 */
async function createKnService(serviceName: string, dockerImageUri: string): Promise<boolean> {
	const port = 5000, minScale = 1, maxScale = 4;
	const deployKnServiceCmd = `kn service create ${serviceName} --image ${dockerImageUri} --port ${port} \
								--annotation autoscaling.knative.dev/minScale=${minScale} \
								--annotation autoscaling.knative.dev/maxScale=${maxScale}`;
	vscode.window.showInformationMessage(`Deploying the Knative service.`);
	printLogInfo("Start deploying the Knative service.");
	try {
		const { stdout, stderr } = await exec(deployKnServiceCmd);
		vscode.window.showInformationMessage(`Succcessfully deployed the Knative service to Kubernetes.`);
		printLogInfo("Succcessfully deployed the Knative service to Kubernetes.\n");
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to deploy the Knative service to Kubernetes.`);
		printLogInfo("Failed to deploy the Knative service to Kubernetes.\n");
		console.error(error);
		return false;
	}
}

/* ========================= Command: aksm.describeKnService ========================*/

/**
 * This function is invoked when command "aksm.describeKnService" is executed.
 */
async function callDescribeKnService() {
	const serviceName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Knative service",
		placeHolder: "xxx-service"
	});
	if (!serviceName) {
		vscode.window.showErrorMessage("Name of the Knative service must be provided.");
		printLogInfo("Name of the Knative service must be provided.\n");
		return;
	}
	describeKnService(serviceName);
}

/**
 * Print useful information about the specified Knative service.
 * 
 * @param serviceName Name of the Knative service.
 */
async function describeKnService(serviceName: string) {
	const describeKnServiceCmd = `kn service describe ${serviceName}`;
	try {
		const { stdout, stderr } = await exec(describeKnServiceCmd);
		printLogInfo("===================== Specified Knative Service ======================");
		printLogInfo(stdout);
	} catch (error) {
		vscode.window.showErrorMessage(`Knative service "${serviceName}" not found.`);
		printLogInfo(`Knative service "${serviceName}" not found.\n`);
		console.error(`Knative service "${serviceName}" not found: `, error);
	}
}

/* ========================== Command: aksm.listKnServices ==========================*/

/**
 * This function is invoked when command "aksm.listKnServices" is executed.
 */
async function callListKnServices() {
	listKnServices();
}

/**
 * List all Knative services.
 */
async function listKnServices() {
	const listKnServicesCmd = `kn service list`;
	try {
		const { stdout, stderr } = await exec(listKnServicesCmd);
		printLogInfo("======================== All Knative Services ========================");
		printLogInfo(stdout);
	} catch (error) {
		vscode.window.showErrorMessage("Failed to list all Knative services.");
		printLogInfo("Failed to list all Knative services.\n");
		console.error("Failed to list all Knative services: ", error);
	}
}

/* ========================= Command: aksm.deleteKnService ==========================*/

/**
 * This function is invoked when command "aksm.deleteKnService" is executed.
 */
async function callDeleteKnativeService() {
	const serviceName = await vscode.window.showInputBox({
		prompt: "Please enter the name of the Knative service to be deleted",
		placeHolder: "xxx-service"
	});
	if (!serviceName) {
		vscode.window.showErrorMessage("Name of the Knative service must be provided.");
		printLogInfo("Name of the Knative service must be provided.\n");
		return;
	}
	deleteKnService(serviceName);
}

/**
 * Delete the specified Knative service.
 * 
 * @param serviceName Name of the Knative service to be deleted.
 */
async function deleteKnService(serviceName: string) {
	const deleteKnServiceCmd = `kn service delete ${serviceName}`;
	vscode.window.showInformationMessage(`Deleting the Knative service "${serviceName}".`);
	printLogInfo(`Deleting the Knative service "${serviceName}".`);
	try {
		const { stdout, stderr } = await exec(deleteKnServiceCmd);
		vscode.window.showInformationMessage(`Successfully deleted the Knative service: "${serviceName}".`);
		printLogInfo(`Successfully deleted the Knative service "${serviceName}".\n`);

	} catch (error) {
		vscode.window.showErrorMessage(`Failed to delete the Knative service: "${serviceName}".`);
		printLogInfo(`Failed to delete the Knative service: "${serviceName}".\n`);
		console.error(error);
	}
}


/* ===================================== Utils ======================================*/

/**
 * This function is invoked when command "aksm.testExtension" is executed.
 */
async function callTestExtension() {
	vscode.window.showInformationMessage(`Extension ${EXTENSION_NAME} is working properly.`);
	printLogInfo(`Extension ${EXTENSION_NAME} is working properly.\n`);
}

/**
 * Display the message in the user's terminal.
 * 
 * @param message Message to be displayed to the user.
 */
async function printLogInfo(message: string) {
	outputChannel.appendLine("[AKSM] " + message);
	outputChannel.show(true);
}
